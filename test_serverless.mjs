import app from './api/index.js';
import http from 'http';
import axios from 'axios';

const server = http.createServer(app);
server.listen(3097, async () => {
  console.log('Test server for api/index.js listening on 3097');
  try {
    const res = await axios.post('http://127.0.0.1:3097/api/fetch', {
      url: 'https://www.instagram.com/reels/DfDUNIcyhr-/'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('Status:', res.status);
    console.log('Data title:', res.data.title);
  } catch (e) {
    console.error('Error:', e.message, e.response?.data);
  } finally {
    server.close();
  }
});

