await import('./build.mjs');
const {createSpreadsheetServer}=await import('./server.mjs');
const {server}=createSpreadsheetServer();
server.listen(Number(process.env.SPREADSHEET_PORT??5422),'127.0.0.1',()=>console.log(`Spreadsheet demo (memory only): http://127.0.0.1:${server.address().port}`));
