# Piano di Fix Vulnerabilità - Webarmonium

## Sommario

Questo documento descrive il piano di implementazione per risolvere le vulnerabilità identificate nell'assessment di sicurezza. Le fix sono ordinate per priorità (P1 = più urgente).

---

## P1 - Rate Limiting WebSocket per Eventi Ad Alta Frequenza

### Problema
Gli eventi `cursor-move`, `gesture` e `hover-update` non hanno rate limiting, permettendo a un client malevolo di floodare il server con migliaia di eventi al secondo.

### Soluzione
Implementare throttling per-socket simile a quello già esistente per `gesture:trail`.

### File da Modificare
- `backend/src/api/socketHandlers.js`

### Implementazione

```javascript
// Aggiungere tracking per socket
socket.lastCursorMove = 0;
socket.lastGesture = 0;
socket.lastHoverUpdate = 0;

// Rate limits (in ms)
const RATE_LIMITS = {
  cursorMove: 16,    // ~60 eventi/sec (sufficiente per 60fps)
  gesture: 50,       // ~20 eventi/sec
  hoverUpdate: 50    // ~20 eventi/sec
};

// Nel handler cursor-move
socket.on('cursor-move', (data) => {
  const now = Date.now();
  if (now - socket.lastCursorMove < RATE_LIMITS.cursorMove) return;
  socket.lastCursorMove = now;
  // ... resto del handler
});
```

### Test
- Verificare che cursor sync funzioni ancora a 60fps
- Test di carico con eventi rapidi per confermare il throttling

---

## P2.1 - Configurazione CORS da Environment Variables

### Problema
Il server usa `origin: "*"` hardcoded invece della configurazione definita in `.env.production`.

### Soluzione
Caricare la configurazione CORS dalle variabili d'ambiente.

### File da Modificare
- `backend/src/server.js`

### Implementazione

```javascript
// Sostituire la configurazione CORS statica
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : '*';

const io = socketIo(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"]
  }
});

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Test
- Verificare connessioni da domini consentiti
- Verificare che domini non autorizzati vengano bloccati in produzione

---

## P2.2 - Limiti Lunghezza Array

### Problema
Gli array `streamedNotes` e `points` non hanno limiti di lunghezza, permettendo memory abuse.

### Soluzione
Aggiungere validazione della lunghezza massima nel ValidationHandler.

### File da Modificare
- `backend/src/api/handlers/ValidationHandler.js`
- `backend/src/api/socketHandlers.js`

### Implementazione

```javascript
// In ValidationHandler.js - aggiungere costanti
const MAX_ARRAY_LENGTHS = {
  streamedNotes: 500,
  points: 1000,
  trailPoints: 200
};

// Funzione di validazione
validateArrayLength(array, maxLength, fieldName) {
  if (!Array.isArray(array)) return false;
  if (array.length > maxLength) {
    console.warn(`Array ${fieldName} exceeds max length: ${array.length} > ${maxLength}`);
    return false;
  }
  return true;
}

// Nei handler, prima di processare
if (!validateArrayLength(data.streamedNotes, MAX_ARRAY_LENGTHS.streamedNotes, 'streamedNotes')) {
  return socket.emit('error', { message: 'Array too large' });
}
```

### Test
- Inviare array oltre il limite e verificare il rifiuto
- Verificare che array validi funzionino correttamente

---

## P3.1 - Rate Limiting Connessioni Socket.io

### Problema
Nessun limite sul numero di connessioni WebSocket per IP, permettendo connection flood.

### Soluzione
Implementare tracking delle connessioni per IP con limite massimo.

### File da Modificare
- `backend/src/server.js`
- `backend/src/api/socketHandlers.js`

### Implementazione

```javascript
// Tracking connessioni per IP
const connectionsByIP = new Map();
const MAX_CONNECTIONS_PER_IP = 10;
const CONNECTION_WINDOW_MS = 60000; // 1 minuto

io.use((socket, next) => {
  const ip = socket.handshake.address;
  const now = Date.now();

  if (!connectionsByIP.has(ip)) {
    connectionsByIP.set(ip, []);
  }

  const connections = connectionsByIP.get(ip);
  // Rimuovi connessioni vecchie
  const recentConnections = connections.filter(t => now - t < CONNECTION_WINDOW_MS);

  if (recentConnections.length >= MAX_CONNECTIONS_PER_IP) {
    return next(new Error('Too many connections'));
  }

  recentConnections.push(now);
  connectionsByIP.set(ip, recentConnections);
  next();
});

// Cleanup periodico
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of connectionsByIP.entries()) {
    const recent = times.filter(t => now - t < CONNECTION_WINDOW_MS);
    if (recent.length === 0) {
      connectionsByIP.delete(ip);
    } else {
      connectionsByIP.set(ip, recent);
    }
  }
}, 60000);
```

### Test
- Tentare >10 connessioni dallo stesso IP
- Verificare che utenti normali non siano impattati

---

## P3.2 - Rimozione Console.log in Produzione

### Problema
Statement `console.log` attivi in produzione causano information disclosure e overhead.

### Soluzione
Sostituire console.log con un logger configurabile o rimuoverli.

### File da Modificare
- `backend/src/api/socketHandlers.js`
- `backend/src/services/*.js`
- `frontend/src/services/*.js`

### Implementazione

```javascript
// Opzione 1: Logger semplice
const logger = {
  debug: process.env.NODE_ENV !== 'production' ? console.log : () => {},
  info: console.info,
  warn: console.warn,
  error: console.error
};

// Sostituire console.log con logger.debug
logger.debug('Socket connected:', socket.id);
```

### Approccio Alternativo
Usare ricerca e sostituzione per:
1. Identificare tutti i `console.log`
2. Rimuovere quelli non necessari
3. Convertire quelli utili in `logger.debug`

### Test
- Verificare che in NODE_ENV=production non ci siano log di debug
- Verificare che errori vengano ancora loggati

---

## P4.1 - Rate Limit Creazione Room per IP

### Problema
Un utente può creare room illimitate, causando resource exhaustion.

### Soluzione
Limitare la creazione di room per IP.

### File da Modificare
- `backend/src/api/socketHandlers.js`

### Implementazione

```javascript
// Tracking creazione room per IP
const roomCreationsByIP = new Map();
const MAX_ROOMS_PER_IP = 5;
const ROOM_CREATION_WINDOW_MS = 3600000; // 1 ora

// Nel handler join-room, prima di creare nuove room
socket.on('join-room', (data) => {
  const ip = socket.handshake.address;
  const roomExists = roomManager.getRoom(data.roomId);

  if (!roomExists) {
    // Sta creando una nuova room
    const now = Date.now();
    const creations = roomCreationsByIP.get(ip) || [];
    const recentCreations = creations.filter(t => now - t < ROOM_CREATION_WINDOW_MS);

    if (recentCreations.length >= MAX_ROOMS_PER_IP) {
      return socket.emit('error', { message: 'Room creation limit exceeded' });
    }

    recentCreations.push(now);
    roomCreationsByIP.set(ip, recentCreations);
  }

  // ... resto del handler
});
```

### Test
- Creare >5 room dallo stesso IP in un'ora
- Verificare che il join a room esistenti non sia limitato

---

## P4.2 - Protezione Endpoint DELETE Room

### Problema
L'endpoint `DELETE /api/rooms/:id` è accessibile senza autenticazione.

### Soluzione
Aggiungere API key semplice per operazioni amministrative.

### File da Modificare
- `backend/src/server.js`
- `backend/.env` (aggiungere ADMIN_API_KEY)

### Implementazione

```javascript
// Middleware per API admin
const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-admin-key'];

  if (!process.env.ADMIN_API_KEY) {
    // Se non configurata, disabilita l'endpoint in produzione
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Admin endpoint disabled' });
    }
    return next(); // Permetti in development
  }

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

// Applicare al route
app.delete('/api/rooms/:id', adminAuth, (req, res) => {
  // ... handler esistente
});
```

### Configurazione
```env
# In .env.production
ADMIN_API_KEY=your-secure-random-key-here
```

### Test
- Chiamare DELETE senza header → 401
- Chiamare DELETE con key corretta → successo
- Verificare che in development funzioni senza key

---

## Ordine di Implementazione Consigliato

| Step | Task | Stima Complessità |
|------|------|-------------------|
| 1 | P1 - WebSocket rate limiting | Bassa |
| 2 | P2.1 - CORS da env | Bassa |
| 3 | P2.2 - Limiti array | Bassa |
| 4 | P3.1 - Connection rate limiting | Media |
| 5 | P3.2 - Rimozione console.log | Bassa |
| 6 | P4.1 - Room creation limit | Bassa |
| 7 | P4.2 - Admin API key | Bassa |

---

## Checklist Pre-Deploy

- [ ] Tutti i test esistenti passano
- [ ] Rate limiting WebSocket testato manualmente
- [ ] CORS testato con domini corretti
- [ ] Verificato che utenti normali non siano impattati
- [ ] `.env.production` aggiornato con ADMIN_API_KEY
- [ ] Nessun console.log visibile in produzione

---

## Note Finali

Questo piano affronta vulnerabilità di **disponibilità** (DoS) piuttosto che di confidenzialità. Data la natura dell'applicazione (dati non sensibili, sessioni anonime), le fix sono miglioramenti incrementali piuttosto che requisiti critici.

L'implementazione può procedere in modo graduale, testando ogni fix in ambiente di sviluppo prima del deploy in produzione.
