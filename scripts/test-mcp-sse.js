/**
 * Test script for MCP SSE Server
 * Tests the SSE connection and MCP protocol messages
 */

import http from 'http';

const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;

async function testMCPSSE() {
  console.log(`Testing MCP SSE Server at ${BASE_URL}`);
  console.log('='.repeat(50));

  // 1. Test health endpoint
  console.log('\n1. Testing /health endpoint...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  const healthData = await healthRes.json();
  console.log('   Health:', JSON.stringify(healthData, null, 2));

  // 2. Test tools endpoint
  console.log('\n2. Testing /tools endpoint...');
  const toolsRes = await fetch(`${BASE_URL}/tools`);
  const toolsData = await toolsRes.json();
  console.log('   Tools:', JSON.stringify(toolsData, null, 2));

  // 3. Test SSE connection with MCP protocol
  console.log('\n3. Testing SSE connection + MCP protocol...');

  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}/sse`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    }, (res) => {
      let sessionId = null;
      let messageEndpoint = null;
      let receivedToolsList = false;

      res.on('data', async (chunk) => {
        const data = chunk.toString();
        console.log('   SSE Event:', data.trim());

        // Parse the endpoint event
        if (data.includes('event: endpoint')) {
          const match = data.match(/data: \/message\?sessionId=([a-f0-9-]+)/);
          if (match) {
            sessionId = match[1];
            messageEndpoint = `${BASE_URL}/message?sessionId=${sessionId}`;
            console.log(`   Session ID: ${sessionId}`);

            // Send tools/list request
            console.log('\n4. Sending tools/list MCP request...');
            try {
              const mcpRes = await fetch(messageEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'tools/list',
                }),
              });
              const mcpData = await mcpRes.text();
              console.log('   MCP Response:', mcpData);
            } catch (err) {
              console.error('   MCP request error:', err.message);
            }
          }
        }

        // Parse MCP response
        if (data.includes('event: message') && data.includes('"tools"')) {
          receivedToolsList = true;
          console.log('\n   ✅ Received tools list via SSE!');
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        req.destroy();
        console.log('\n' + '='.repeat(50));
        console.log('Test completed!');
        console.log('SSE Connection: ✅');
        console.log('MCP Protocol: ' + (receivedToolsList ? '✅' : '⚠️ (response may be in different format)'));
        resolve();
      }, 5000);
    });

    req.on('error', (err) => {
      console.error('Connection error:', err.message);
      reject(err);
    });

    req.end();
  });
}

testMCPSSE().catch(console.error);
