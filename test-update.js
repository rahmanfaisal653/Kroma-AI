const axios = require('axios');
const KROOMBASE_URL = 'https://kroombase.kroombox.com/rest';
const getHeaders = () => ({
  'apikey': '9dd741c63be161dc6c21d7f9c0b2badbc19c7c6a39f74102ba7a5764e31ddeef',
  'Content-Type': 'application/json'
});

async function run() {
  try {
    const listRes = await axios.get(`${KROOMBASE_URL}/apis`, { headers: getHeaders() });
    if (!listRes.data || listRes.data.length === 0) {
      console.log('No APIs found');
      return;
    }
    const api = listRes.data[0];
    console.log('Got API:', api.id);
    
    // Test PUT
    const payload = { active: 1 };
    await axios.put(`${KROOMBASE_URL}/apis/${api.id}`, payload, { headers: getHeaders() });
    console.log('PUT active SUCCESS');
  } catch(e) {
    console.log('Error:', e.response?.data || e.message);
  }
}
run();
