/**
 * Test if the Forma token is valid by calling a simple API
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BEARER_TOKEN = process.env.BEARER_TOKEN;
const FORMA_PROJECT_ID = process.env.FORMA_PROJECT_ID;

console.log('Testing Forma API access...');
console.log('Project ID:', FORMA_PROJECT_ID);
console.log('Token (first 50 chars):', BEARER_TOKEN.substring(0, 50));

// Try to get project/site info
async function testToken() {
  try {
    // Test with Site API (simpler endpoint)
    const url = `https://developer.api.autodesk.com/forma/site/v1alpha/sites/${FORMA_PROJECT_ID}`;
    
    console.log('\nTesting Site API:');
    console.log('URL:', url);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${BEARER_TOKEN}`
      }
    });
    
    console.log('\n✅ Token is VALID!');
    console.log('Site data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('\n❌ Token test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      if (error.response.status === 401) {
        console.error('\n💡 Token is expired or invalid. Please run:');
        console.error('   node forma_token/get_token.js');
      }
    } else {
      console.error('Error:', error.message);
    }
  }
}

testToken();
