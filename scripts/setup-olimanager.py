#!/usr/bin/env python3
"""Recreate Olifogli test fixtures on an Olimanager instance (stdlib + curl only)."""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import copy
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit

DEFAULT_URL = "https://staging.olimpiadi-scientifiche.it"


class Element:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def all(self, tag=None):
        for child in self.children:
            if isinstance(child, Element):
                if tag is None or child.tag == tag:
                    yield child
                yield from child.all(tag)

    def text(self):
        return "".join(c.text() if isinstance(c, Element) else c for c in self.children)


class Document(HTMLParser):
    VOID = {"input", "br", "hr", "img", "link", "meta", "source", "area", "base", "embed", "wbr", "col", "param"}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def admin_form(html):
    doc = Document(html)
    forms = list(doc.root.all("form"))
    form = next((f for f in forms if f.attrs.get("id", "").endswith("_form")), None)
    if form is None:
        raise RuntimeError("Modulo Django non trovato: permessi insufficienti o sessione scaduta.")
    fields = {}
    for item in form.all():
        name = item.attrs.get("name")
        if not name or "disabled" in item.attrs:
            continue
        if item.tag == "input":
            kind = item.attrs.get("type", "text")
            if kind in {"submit", "button", "file", "reset"}:
                continue
            if kind in {"checkbox", "radio"} and "checked" not in item.attrs:
                fields.setdefault(name, [])
                continue
            fields.setdefault(name, []).append(item.attrs.get("value", "on" if kind == "checkbox" else ""))
        elif item.tag == "textarea":
            fields[name] = [item.text()]
        elif item.tag == "select":
            options = [o for o in item.all("option") if "disabled" not in o.attrs]
            selected = [o for o in options if "selected" in o.attrs]
            if not selected and "multiple" not in item.attrs:
                selected = options[:1]
            fields[name] = [o.attrs.get("value", o.text()) for o in selected]
    return fields


def set_fields(fields, values):
    for name, value in values.items():
        if name not in fields:
            raise RuntimeError(f"Campo Django inatteso o non modificabile: {name}")
        fields[name] = [] if value is False or value is None else (
            ["on"] if value is True else [str(v) for v in value] if isinstance(value, list) else [str(value)]
        )
    return fields


class Olimanager:
    def __init__(self, cookie_path, origin=DEFAULT_URL):
        parsed = urlsplit(origin)
        if (parsed.scheme not in {"http", "https"} or not parsed.netloc
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in {"", "/"}):
            raise ValueError("Specificare un URL di base HTTP/HTTPS, senza percorso o credenziali.")
        self.origin = origin.rstrip("/")
        self.cookies = Path(cookie_path)
        self.last_admin_request = 0
        self.add_forms = {}

    def request(self, path, data=None, graphql=False):
        url = urljoin(self.origin + "/", path)
        if urlsplit(url)[:2] != urlsplit(self.origin)[:2]:
            raise RuntimeError("La richiesta deve restare sull’istanza Olimanager configurata.")
        if urlsplit(url).path.startswith('/admin/'):
            # The staging nginx configuration permits one admin request per second.
            time.sleep(max(0, 1.1 - (time.monotonic() - self.last_admin_request)))
            self.last_admin_request = time.monotonic()
        args = ["curl", "--silent", "--show-error", "--max-time", "45",
                "--cookie", str(self.cookies), "--cookie-jar", str(self.cookies),
                "--write-out", "\n%{http_code}", url]
        payload = None
        if data is not None:
            csrf = next((line.split("\t")[-1] for line in self.cookies.read_text().splitlines()
                         if "\tcsrftoken\t" in line), "")
            args += ["-H", f"X-CSRFToken: {csrf}", "-H", f"Referer: {self.origin}/", "-H", f"Origin: {self.origin}"]
            args += ["-H", "Content-Type: application/json" if graphql else "Content-Type: application/x-www-form-urlencoded",
                     "--data-binary", "@-"]
            payload = json.dumps(data) if graphql else urlencode(data, doseq=True)
        result = subprocess.run(args, input=payload, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(f"Connessione a Olimanager fallita (curl {result.returncode}).")
        body, code = result.stdout.rsplit("\n", 1)
        status = int(code)
        if status not in {200, 302, 303}:
            raise RuntimeError(f"HTTP {status} su {urlsplit(url).path}")
        return status, body

    def graphql(self, query, variables=None):
        _, body = self.request("/graphql/", {"query": query, "variables": variables or {}}, graphql=True)
        result = json.loads(body)
        if result.get("errors"):
            raise RuntimeError("Errori GraphQL: " + "; ".join(e["message"] for e in result["errors"]))
        return result["data"]

    def login(self, email, password):
        self.request("/admin/login/")
        result = self.graphql('''mutation($email:String!,$password:String!){users{
          login(email:$email,password:$password){__typename
            ... on LoginSuccess {user{id isStaff}}
            ... on OperationInfo {messages{message}}}}}''', {"email": email, "password": password})
        login = result["users"]["login"]
        if login["__typename"] != "LoginSuccess" or not login["user"]["isStaff"]:
            raise RuntimeError("Login fallito o account privo dei permessi di amministrazione.")
        return login["user"]["id"]

    def find(self, model, filters, first=False):
        _, html = self.request(f"/admin/{model}/?{urlencode(filters)}")
        doc = Document(html)
        table = next((n for n in doc.root.all("table") if n.attrs.get("id") == "result_list"), None)
        if table is None:
            # Empty changelists have no result table. A login page must never count as empty.
            if any(f.attrs.get("id") == "login-form" for f in doc.root.all("form")):
                raise RuntimeError("Sessione admin scaduta.")
            if not any(n.attrs.get("id") == "changelist" for n in doc.root.all()):
                raise RuntimeError(f"Elenco admin non riconosciuto: {model}")
            return None
        pattern = re.compile(r"^/admin/" + re.escape(model) + r"/([^/]+)/change/$")
        ids = {match.group(1) for a in table.all("a")
               if (match := pattern.match(urlsplit(urljoin(f"{self.origin}/admin/{model}/", a.attrs.get("href", ""))).path))}
        if len(ids) > 1 and not first:
            raise RuntimeError(f"Più oggetti corrispondono al filtro per {model}: intervento manuale necessario.")
        return sorted(ids, key=lambda value: (len(value), value))[0] if ids else None

    def fields(self, model, pk=None):
        if pk is None and model in self.add_forms:
            return copy.deepcopy(self.add_forms[model])
        _, html = self.request(f"/admin/{model}/{pk + '/change' if pk else 'add'}/")
        fields = admin_form(html)
        if pk is None:
            self.add_forms[model] = copy.deepcopy(fields)
        return fields

    def ensure(self, model, filters, values, apply):
        pk = self.find(model, filters)
        if pk:
            print(f"Riutilizzo {model}: {pk}")
            return pk
        fields = set_fields(self.fields(model), values)
        print(f"{'Creo' if apply else 'Da creare'} {model}")
        if not apply:
            return None
        fields["_save"] = ["Save"]
        status, html = self.request(f"/admin/{model}/add/", fields)
        if status == 200:
            doc = Document(html)
            errors = [n.text().strip() for n in doc.root.all()
                      if "errorlist" in n.attrs.get("class", "").split()]
            raise RuntimeError(f"Creazione {model} rifiutata: {'; '.join(errors) or 'controllare il modulo admin'}")
        pk = self.find(model, filters)
        if pk is None:
            raise RuntimeError(f"Oggetto {model} non trovato dopo la creazione.")
        return pk


def one(fields, name):
    return next(iter(fields.get(name, [])), "")


def iso_date(value):
    if not value:
        return None
    for pattern in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            pass
    raise RuntimeError("Formato della data di nascita non riconosciuto.")


def mutation_result(data, group, field, success):
    value = data[group][field]
    if value["__typename"] != success:
        raise RuntimeError(f"{field}: " + "; ".join(m["message"] for m in value.get("messages", [])))
    return value


def archimede_contests(api, args, edition_id, school_id, school, teacher_user_id):
    teacher_user = api.fields("users/user", teacher_user_id)
    contests = {}
    for category, variant in [("biennio", "2"), ("triennio", "3")]:
        name = f"Archimede {category.capitalize()} — test Olifogli {args.year}"
        contest_id = api.ensure("contests/contest", {"edition__id__exact": edition_id, "name__exact": name}, {
            "name": name, "edition": edition_id, "scope": 0, "state": 2,
            "allow_result_upload": True, "max_venue_depth": 0,
        }, args.apply)
        for index in range(1, 17):
            api.ensure("contests/contestproblem", {"contest__id__exact": contest_id or 0, "index__exact": index}, {
                "contest": contest_id or "0", "index": index, "codename": f"P{index}",
                "title": f"Archimede {category} — problema {index}", "min_score": 0, "max_score": 5,
            }, args.apply)
        venue_id = api.ensure("venues/venue", {"contest__id__exact": contest_id or 0, "name__exact": "Olifogli — sede test"}, {
            "name": "Olifogli — sede test", "contest": contest_id or "0",
            "location": one(school, "location"), "extra_schools": school_id,
        }, args.apply)
        api.ensure("venues/venueadmin", {"venue__id__exact": venue_id or 0, "user__id__exact": teacher_user_id}, {
            "user": teacher_user_id, "venue": venue_id or "0", "read_only": False,
            # Django validates these required fields before VenueAdmin.save()
            # can populate the historical copy from the related user.
            "name": one(teacher_user, "name"), "surname": one(teacher_user, "surname"),
        }, args.apply)
        contests[category] = {"contestId": contest_id, "venueId": venue_id,
                              "schema": f"archimede_{category}", "variant": variant + "11"}
    return contests


def archimede_rows(user, student, year, contests):
    class_year = int(one(student, "class_year"))
    if not 9 <= class_year <= 13:
        raise RuntimeError("Archimede richiede uno studente delle superiori (classYear 9–13). Specificare --student EMAIL.")
    category = "biennio" if class_year <= 10 else "triennio"
    rows = [{"case": "account-esistente", "category": category,
             "name": one(user, "name"), "surname": one(user, "surname"),
             "birthDate": iso_date(one(user, "birth_date")), "classYear": class_year,
             "section": one(student, "section")}]
    for category, school_year, age in [("biennio", 10, 15), ("triennio", 12, 17)]:
        for case, surname, month in [("senza-account", "SenzaAccount", 3), ("nuovo-da-abbinare", "Nuovo", 4)]:
            rows.append({"case": case, "category": category, "name": "Studente",
                         "surname": f"Olifogli{surname}{category.capitalize()}",
                         "birthDate": f"{year - age}-{month:02d}-14", "classYear": school_year, "section": "A"})
    for row in rows:
        contest = contests[row["category"]]
        row.update({"contestId": contest["contestId"], "schema": contest["schema"], "variant": contest["variant"]})
        # This is ready for an Olifogli row: high-school years are numbered 1–5.
        row["olifogliData"] = {"name": row["name"], "surname": row["surname"],
                               "birthDate": dt.date.fromisoformat(row["birthDate"]).strftime("%d/%m/%Y") if row["birthDate"] else "",
                               "classYear": str(row["classYear"] - 8), "classSection": row["section"],
                               "variant": row["variant"]}
    return rows


def setup(api, args, admin_id):
    # Seeded account documented in Olimanager's docs/Staging.md.
    student_id = api.find("students/student", {"q": args.student} if args.student else {}, first=not args.student)
    if not student_id:
        raise RuntimeError(f"Studente {args.student} non trovato. Specificare --student EMAIL.")
    student = api.fields("students/student", student_id)
    if not 9 <= int(one(student, "class_year")) <= 13:
        raise RuntimeError("Archimede richiede uno studente delle superiori (classYear 9–13). Specificare --student EMAIL.")
    school_id = one(student, "school")
    school = api.fields("schools/school", school_id)
    school_code = one(school, "external_id")
    if not school_code:
        raise RuntimeError("La scuola dello studente non ha un codice ministeriale.")
    user = api.fields("users/user", one(student, "user"))
    if args.student and one(user, "email").casefold() != args.student.casefold():
        raise RuntimeError("La ricerca studente non ha restituito l'account richiesto.")
    args.student = one(user, "email")
    if not args.teacher:
        candidate = api.find("teachers/teacher", {"school__id__exact": school_id}, first=True)
        candidate = candidate or api.find("teachers/teacher", {}, first=True)
        if not candidate:
            raise RuntimeError("Nessun docente disponibile nell’istanza. Specificare --teacher EMAIL.")
        teacher_user_id = one(api.fields("teachers/teacher", candidate), "user")
        args.teacher = one(api.fields("users/user", teacher_user_id), "email")
    teacher_user_id = api.find("users/user", {"email__exact": args.teacher})
    if not teacher_user_id:
        raise RuntimeError(f"Docente {args.teacher} non trovato. Specificare --teacher EMAIL.")
    edition_id = f"olifogli-test-{args.year}"
    print(f"Scuola: {school_id} ({school_code}); edizione: {edition_id}")
    teacher_id = api.ensure("teachers/teacher", {"user__id__exact": teacher_user_id, "school__id__exact": school_id}, {
        "user": teacher_user_id, "school": school_id,
        "verified_at_0": dt.date.today().isoformat(), "verified_at_1": "12:00:00", "verified_by": admin_id,
    }, args.apply)
    olympiad_id = api.ensure("olympiads/olympiad", {"id__exact": "olifogli-test"}, {
        "id": "olifogli-test", "name": "Olimpiadi di Matematica — test Olifogli", "kind": "Olympiad",
        "contact_email": "olifogli-test@example.invalid",
    }, args.apply)
    # Placeholders allow the preview to validate all add-form field names too.
    api.ensure("olympiads/olympiadedition", {"id__exact": edition_id}, {
        "id": edition_id, "olympiad": olympiad_id or "olifogli-test",
        "name": f"Giochi di Archimede — test {args.year}", "ordinal_number": 1, "year": args.year,
        "competitor_kind": "S", "school_types": [one(school, "type")],
        **{f"{field}_{part}": value for field, date in [
            ("school_registration_start", f"{args.year}-01-01"),
            ("school_registration_stop", f"{args.year}-12-30"),
            ("student_registration_start", f"{args.year}-01-02"),
            ("student_registration_stop", f"{args.year}-12-31"),
            ("student_updates_stop", f"{args.year}-12-31"),
        ] for part, value in [(0, date), (1, "12:00:00")]},
    }, args.apply)
    api.ensure("schools/schoolsubscription", {"school__id__exact": school_id, "edition__id__exact": edition_id}, {
        "school": school_id, "edition": edition_id, "contact": teacher_id or "0",
        "automatic_competitor_verification": True, "donation": 0,
    }, args.apply)
    contests = archimede_contests(api, args, edition_id, school_id, school, teacher_user_id)
    rows = archimede_rows(user, student, args.year, contests)
    venue_id = contests[rows[0]["category"]]["venueId"]
    if args.apply:
        # Existing competitor subscriptions are discovered through the admin to avoid
        # calling manualStudentSubscribe again (it rejects duplicate subscriptions).
        competitor_id = api.find("competitors/competitor", {"edition__id__exact": edition_id, "q": args.student})
        if not competitor_id:
            data = api.graphql('''mutation($student:Int!,$edition:String!){competitors{
              manualStudentSubscribe(studentId:$student,editionId:$edition,extraFieldEntries:[]){
                __typename ... on ManualStudentSubscribeSuccess {competitor{id}}
                ... on OperationInfo {messages{message}}}}}''', {"student": int(student_id), "edition": edition_id})
            competitor_id = str(mutation_result(data, "competitors", "manualStudentSubscribe", "ManualStudentSubscribeSuccess")["competitor"]["id"])
        participant_id = api.find("participants/participant", {"competitor__id__exact": competitor_id, "official_venue__id__exact": venue_id})
        if not participant_id:
            data = api.graphql('''mutation($competitor:Int!,$venue:Int!){participants{
              manualCreateParticipant(competitorId:$competitor,venueId:$venue){__typename
                ... on ManualParticipantCreateSuccess {participant{id}}
                ... on OperationInfo {messages{message}}}}}''', {"competitor": int(competitor_id), "venue": int(venue_id)})
            participant_id = str(mutation_result(data, "participants", "manualCreateParticipant", "ManualParticipantCreateSuccess")["participant"]["id"])
        rows[0]["participantId"] = participant_id
        for raw in rows[1:]:
            if raw["case"] != "senza-account":
                continue  # New rows must stay absent from Olimanager for import tests.
            data = api.graphql('''mutation($contest:Int!,$school:String!,$name:String!,$surname:String!,$birth:Date,$year:Int!,$section:String!){participants{
              matchOrCreateParticipant(contestId:$contest,schoolExternalId:$school,name:$name,surname:$surname,
                birthDate:$birth,classYear:$year,section:$section){__typename
                  ... on ParticipantMatchSuccess {participant{id} multipleCompetitorsMatched}
                  ... on OperationInfo {messages{message}}}}}''', {"contest": int(raw["contestId"]), "school": school_code,
                    "name": raw["name"], "surname": raw["surname"], "birth": raw["birthDate"], "year": raw["classYear"], "section": raw["section"]})
            match = mutation_result(data, "participants", "matchOrCreateParticipant", "ParticipantMatchSuccess")
            if match["multipleCompetitorsMatched"]:
                raise RuntimeError("Abbinamento ambiguo per il concorrente sintetico: verificare Olimanager.")
            raw["participantId"] = str(match["participant"]["id"])
    workbook_data = json.loads((Path(__file__).parent / "fixtures/archimede.json").read_text())
    workbook_data.update({"contest_year": str(args.year),
        "olimanager_archimede_biennio_contest_id": contests["biennio"]["contestId"],
        "olimanager_archimede_triennio_contest_id": contests["triennio"]["contestId"],
        "olimanager_contest_id": contests["triennio"]["contestId"]})
    manifest = {"origin": api.origin, "applied": args.apply, "editionId": edition_id,
                "contests": contests, "schoolId": school_id, "schoolExternalId": school_code,
                "teacherEmail": args.teacher, "studentEmail": args.student,
                "workbookCommonData": workbook_data, "sheetCommonData": {"Codice_meccanografico": school_code},
                "rows": rows}
    if args.output:
        args.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        print(f"Manifest salvato in {args.output}")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    if not args.apply:
        print("Verifica completata. Per creare i dati: npm run olimanager:setup -- --apply")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("OLIMANAGER_SETUP_URL", DEFAULT_URL), help="URL di base di Olimanager (predefinito: staging)")
    parser.add_argument("--username", default=os.environ.get("OLIMANAGER_SETUP_USERNAME"), help="Email amministratore")
    parser.add_argument("--apply", action="store_true", help="Crea soltanto gli oggetti mancanti")
    parser.add_argument("--year", type=int, default=dt.date.today().year)
    parser.add_argument("--teacher", help="Email di un docente esistente; altrimenti sceglie dal database")
    parser.add_argument("--student", help="Email di uno studente esistente; altrimenti sceglie dal database")
    parser.add_argument("--output", type=Path, help="Salva il manifest JSON (non contiene credenziali)")
    args = parser.parse_args()
    if not 2000 <= args.year <= 2099:
        parser.error("--year deve essere compreso tra 2000 e 2099")
    email = (args.username or "").strip() or "admin@olimanager.it"
    password = os.environ.get("OLIMANAGER_SETUP_PASSWORD")
    if not password:
        if args.url.rstrip("/") == DEFAULT_URL and email == "admin@olimanager.it":
            password = email  # Public test credentials documented for staging.
        else:
            parser.error("Impostare OLIMANAGER_SETUP_PASSWORD per l’istanza scelta.")
    with tempfile.TemporaryDirectory(prefix="olifogli-olimanager-") as tmp:
        api = Olimanager(Path(tmp) / "cookies", args.url)
        admin_id = api.login(email, password)
        print("Accesso admin a Olimanager riuscito.")
        setup(api, args, admin_id)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(f"Errore: {error}", file=sys.stderr)
        sys.exit(1)
