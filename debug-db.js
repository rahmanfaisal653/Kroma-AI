import axios from 'axios';

const KROOMBASE_URL = 'https://kroombase.kroombox.com/rest';
// Use the key that worked in previous verification
const API_KEY = 'a21a1ce40ce7f3fb5ee5ab393db9edbce11bf99fe065968fe01f119fee94287c';

const headers = {
  'apikey': API_KEY,
  'Content-Type': 'application/json'
};

async function testUsersTable() {
  console.log('Testing connection to users table...');
  try {
    const start = Date.now();
    const res = await axios.get(`${KROOMBASE_URL}/users`, { 
      headers,
      params: { limit: 5 } 
    });
    const duration = Date.now() - start;
    console.log(`✅ Success! Got ${res.data.length} users in ${duration}ms`);
    console.log('First user sample:', res.data[0]);
  } catch (error) {
    console.error('❌ Failed:', error.message);
    if (axios.isAxiosError(error) && error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testUsersTable();
