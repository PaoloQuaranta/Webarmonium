# Abuse Reports - Mirror Sites

**Date:** 2026-01-15
**Status:** DRAFT - Da inviare

## Mirror Sites Identificati

| Dominio | Registrar | Data Registrazione | IP | Privacy |
|---------|-----------|-------------------|-----|---------|
| treasurecompass.org | Dynadot Inc | 2025-05-26 | 172.67.165.37 | Super Privacy Service LTD |
| starlighthorizon.org | Dynadot Inc | 2025-05-26 | 172.67.162.223 | Super Privacy Service LTD |

**Nota:** Entrambi registrati lo stesso giorno, stesso registrar, entrambi dietro Cloudflare.

---

## 1. Report a Dynadot (Registrar)

**To:** abuse@dynadot.com
**Subject:** DMCA/Abuse Report - Unauthorized mirroring of copyrighted web application

---

Dear Dynadot Abuse Team,

I am the owner/developer of Webarmonium (webarmonium.com), a real-time collaborative music platform.

I have discovered that the following domains registered through Dynadot are hosting unauthorized mirrors/copies of my copyrighted web application:

**Infringing Domains:**
- treasurecompass.org (registered 2025-05-26)
- starlighthorizon.org (registered 2025-05-26)

**Evidence of Infringement:**
1. Both domains were registered on the same date, suggesting coordinated activity
2. Both domains serve exact copies of my application's frontend and attempt to connect to my backend servers
3. Both use privacy protection to hide the registrant's identity

**My Original Work:**
- Domain: webarmonium.com
- Application: Real-time collaborative music platform using WebSocket, Canvas API, and Tone.js
- Copyright: All rights reserved

**Requested Action:**
Please suspend these domains for Terms of Service violation (hosting stolen/mirrored content without authorization).

I declare under penalty of perjury that I am the copyright owner of the infringed material and that the information in this notice is accurate.

Best regards,
[IL TUO NOME]
[LA TUA EMAIL]
[DATA]

---

## 2. Report a Cloudflare

**URL:** https://abuse.cloudflare.com
**Category:** Phishing / Impersonation / Copyright

### Informazioni da inserire nel form:

**Your Information:**
- Name: [IL TUO NOME]
- Email: [LA TUA EMAIL]
- Company: Webarmonium

**Reported URLs:**
- https://www.treasurecompass.org
- https://www.starlighthorizon.org

**Original Content URL:**
- https://webarmonium.com

**Description:**
```
These websites are unauthorized mirrors of my web application "Webarmonium".
They copy the entire frontend code and attempt to impersonate my service to users.

Evidence:
1. Both sites were registered on the same day (2025-05-26) through Dynadot
2. Both are placed behind Cloudflare to hide the real hosting provider
3. Both serve exact copies of my application's HTML, CSS, and JavaScript
4. Both attempt to connect to my backend WebSocket servers

This appears to be a coordinated phishing/impersonation operation.
The original and legitimate service is available at webarmonium.com

I am the copyright owner and developer of the Webarmonium platform.
```

**Evidence/Screenshots:**
- Allegare screenshot dei siti mirror
- Allegare screenshot del sito originale per confronto

---

## 3. Segnalazione a Google Safe Browsing

**URL:** https://safebrowsing.google.com/safebrowsing/report_phish/

### Per treasurecompass.org:

**URL to report:** https://www.treasurecompass.org

**Additional details:**
```
This website is an unauthorized mirror/copy of webarmonium.com, a legitimate
collaborative music platform. The site copies all frontend code and attempts
to impersonate the original service. Registered on 2025-05-26 through Dynadot
with privacy protection enabled.
```

### Per starlighthorizon.org:

**URL to report:** https://www.starlighthorizon.org

**Additional details:**
```
This website is an unauthorized mirror/copy of webarmonium.com, a legitimate
collaborative music platform. The site copies all frontend code and attempts
to impersonate the original service. Registered on 2025-05-26 through Dynadot
with privacy protection enabled. Same operator as treasurecompass.org.
```

---

## 4. Segnalazione ICANN (opzionale)

**URL:** https://www.icann.org/compliance/complaint

**Type:** Domain Name Registration Data Directory Services (WHOIS) Complaint

Se ritieni che i dati WHOIS siano falsi o inaccurati.

---

## Checklist Azioni

- [ ] Inviare email a abuse@dynadot.com
- [ ] Compilare form Cloudflare abuse
- [ ] Segnalare a Google Safe Browsing (treasurecompass.org)
- [ ] Segnalare a Google Safe Browsing (starlighthorizon.org)
- [ ] Screenshot dei siti mirror come prova
- [ ] Screenshot del sito originale per confronto
- [ ] Salvare copie delle risposte ricevute

---

## Note Tecniche

Le protezioni anti-mirroring sono state implementate nel backend:
- File: `backend/src/utils/DomainProtection.js`
- Domini bloccati configurati nel codice
- Middleware HTTP e WebSocket attivi
- Entry #115 nel development log

---

## WHOIS Raw Data

### treasurecompass.org
```
Registrar: Dynadot Inc
Created: 2025-05-26
Expires: 2026-05-26
Name Servers: aria.ns.cloudflare.com, louis.ns.cloudflare.com
IP: 172.67.165.37
Abuse: abuse@dynadot.com (+1.6502620100)
```

### starlighthorizon.org
```
Registrar: Dynadot Inc
Created: 2025-05-26
Expires: 2026-05-26
Name Servers: curt.ns.cloudflare.com, meilani.ns.cloudflare.com
IP: 172.67.162.223
Abuse: abuse@dynadot.com (+1.6502620100)
```
