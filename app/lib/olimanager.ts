import { gql, request, GraphQLClient } from 'graphql-request';

const payload = {
    "operationName":"SubscriptionsTable",
    "variables":{"editionId":"olimat25","after":null,"filter":{},"order":{"school":{"name":"ASC"}}},
    "query":
    "query SubscriptionsTable($editionId: String!, $after: String, $filter: SchoolSubscriptionFilter, $order: SchoolSubscriptionOrder) {\n  olympiads {\n    edition(id: $editionId) {\n      subscriptions(after: $after, filters: $filter, order: $order) {\n        ...SubscriptionTableFragment\n        edges {\n          node {\n            status\n            donation\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment SubscriptionTableFragment on SchoolSubscriptionTypeConnection {\n  pageInfo {\n    hasNextPage\n    endCursor\n    __typename\n  }\n  totalCount\n  edges {\n    node {\n      isValid\n      school {\n        ...SchoolFragment\n        location {\n          city {\n            province {\n              region {\n                name\n                __typename\n              }\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      contact {\n        user {\n          name\n          surname\n          email\n          phoneNumber\n          __typename\n        }\n        name\n        surname\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment SchoolFragment on SchoolType {\n  id\n  externalId\n  name\n  type {\n    name\n    isLower\n    isMiddle\n    isHigher\n    __typename\n  }\n  email\n  isActive\n  gameOnly\n  location {\n    address\n    postalCode\n    city {\n      id\n      name\n      province {\n        id\n        name\n        region {\n          name\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}"
}

const query = `
query SubscriptionsTable($editionId: String!, $after: String, $filter: SchoolSubscriptionFilter, $order: SchoolSubscriptionOrder) {
  olympiads {
    edition(id: $editionId) {
      subscriptions(after: $after, filters: $filter, order: $order) {
        ...SubscriptionTableFragment
        edges {
          node {
            status
            donation
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment SubscriptionTableFragment on SchoolSubscriptionTypeConnection {
  pageInfo {
    hasNextPage
    endCursor
    __typename
  }
  totalCount
  edges {
    node {
      isValid
      school {
        ...SchoolFragment
        location {
          city {
            province {
              region {
                name
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        __typename
      }
      contact {
        user {
          name
          surname
          email
          phoneNumber
          __typename
        }
        name
        surname
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

fragment SchoolFragment on SchoolType {
  id
  externalId
  name
  type {
    name
    isLower
    isMiddle
    isHigher
    __typename
  }
  email
  isActive
  gameOnly
  location {
    address
    postalCode
    city {
      id
      name
      province {
        id
        name
        region {
          name
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}
`;

const url = 'https://olimpiadi-scientifiche.it/graphql';


export async function test0() {
    const document = gql`
    query {
        countries {
            capital
        } 
    }
    `
    const data = await request("https://countries.trevorblades.com/", document)
    console.log(data)
    return JSON.stringify(data)
}

export async function test() {
    const document = gql`
    query {
        healtCheck
    }`
    const URL = process.env.OLIMANAGER_GRAPHQL
    if (!URL) throw new Error("OLIMANAGER_GRAPHQL not set")
    console.log(`query ${URL}`)
    const data = await request(URL, document)
    console.log(data)
    return data
}

export async function tost() {
    const client = new GraphQLClient(url);
    const USERNAME = process.env.OLIMANAGER_USERNAME;
    const PASSWORD = process.env.OLIMANAGER_PASSWORD;

    if (!USERNAME || !PASSWORD) {
        console.error("Please add your Olimpiadi Scientifiche credentials to .env");
        return;
    }

    const r = `mutation {
        users{
          login(email: "$USERNAME", password: "$PASSWORD"){
            __typename
            ...on OperationInfo{
              messages{
                message
                kind
              }
            }
            ...on LoginSuccess{
              user{
                email
              }
            }
          }
        }
      }`.replace("$USERNAME", USERNAME).replace("$PASSWORD", PASSWORD)
    
    const data = await client.request(r)

    console.log(data)

    return data
}
