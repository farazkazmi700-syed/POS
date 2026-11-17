// Local delivery sinks for disposable API tests. Never contact an external mailbox or phone.
const net = require('node:net');
const http = require('node:http');
exports.startRecoveryFixtures = async () => {
  const emails = []; const messages = []; const sockets = new Set();
  const smtp = net.createServer((socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    let buffer = ''; let data = false; let message = '';
    socket.write('220 localhost test SMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n'); const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) { if (line === '.') { emails.push(message); message = ''; data = false; socket.write('250 Accepted\r\n'); } else message += line + '\r\n'; continue; }
        if (/^EHLO|^HELO/.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/.test(line)) socket.write('235 Authenticated\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 Send message\r\n'); }
        else if (line === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  let failWhatsapp = false;
  const whatsapp = http.createServer((request, response) => {
    let body = ''; request.on('data', (chunk) => body += chunk.toString());
    request.on('end', () => {
      messages.push(Object.fromEntries(new URLSearchParams(body)));
      response.writeHead(failWhatsapp ? 503 : 201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(failWhatsapp ? { error: 'Test delivery failure' } : { sid: 'SM-test', status: 'queued' }));
    });
  });
  await new Promise((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => whatsapp.listen(0, '127.0.0.1', resolve));
  return { emails, messages, smtpPort: smtp.address().port, whatsappUrl: `http://127.0.0.1:${whatsapp.address().port}`, failWhatsapp: (value) => failWhatsapp = value,
    close: async () => { for (const socket of sockets) socket.destroy(); await Promise.all([new Promise((resolve) => smtp.close(resolve)), new Promise((resolve) => whatsapp.close(resolve))]); },
  };
};
