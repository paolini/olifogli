export default function Home() {
  return <Table></Table>
}

function Table() {
  return <>
    <table>
      <thead>
        <tr>
          <th>cognome</th>
          <th>nome</th>
          <th>risposte</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Row 1 Data 1</td>
          <td>Row 1 Data 2</td>
        </tr>
        <tr>
          <td>Row 2 Data 1</td>
          <td>Row 2 Data 2</td>
        </tr>
        <InputRow />
      </tbody>
    </table>
  </>
}

function InputRow() {
  return <tr>
    <td><input type="text" /></td>
    <td><input type="text" /></td>
    <td><input type="text" size={5}/></td>
    <td><button>salva</button></td>
  </tr>
}