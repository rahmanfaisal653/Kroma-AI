import https from 'https';
import process from 'process';

const KROOMBASE_API_KEY = process.env.KROOMBASE_API_KEY || 'a21a1ce40ce7f3fb5ee5ab393db9edbce11bf99fe065968fe01f119fee94287c';
const HOST = 'kroombase.kroombox.com';
const PATH = '/rest';

const options = {
  hostname: HOST,
  path: PATH + '/docs?limit=1', 
  method: 'GET',
  headers: {
    'apikey': KROOMBASE_API_KEY,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Docs table sample:', json);
    } catch (e) {
      console.log('Response is not JSON:', data);
    }
  });
});

req.end();
