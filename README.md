# HFN RSVP Backend

Express + MongoDB API for meetup registrations.

## Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI
npm install
npm run dev
```

API runs at `http://localhost:4000`.

## Endpoints

- `GET /` — health
- `POST /api/rsvp` — create registration

### RSVP body

```json
{
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "phone": "+91…",
  "education": "B.Tech, IIIT Hyderabad, 2024",
  "jobTitle": "Founder",
  "company": "Acme",
  "event": {
    "slug": "founders-open-house",
    "title": "Founders Open House — July",
    "dateISO": "2026-07-18",
    "dateLabel": "Saturday, 18 July 2026",
    "time": "5:00 – 8:00 PM IST",
    "venue": "T-Hub, Phase 2, Madhapur",
    "city": "Hyderabad",
    "format": "Offline"
  }
}
```

`jobTitle` and `company` are optional. Duplicate email + event slug returns `409`.

## Hackathon participation certificates

The backend packages an unchanged copy of the AI HACK × MRDU participation-certificate PDF at
`src/assets/participation-certificate-template.pdf`. Override its location with
`PARTICIPATION_CERTIFICATE_TEMPLATE_PATH` only when deploying a different copy of the same design.
Puppeteer uses one headless Chrome instance and generates PDFs in memory; generated PDFs are uploaded
to the private `certificates` MinIO bucket and are not stored on the server.

Admin certificate APIs:

- `POST /api/admin/hackathons/:hackathonId/certificates/generate`
- `GET /api/admin/hackathons/:hackathonId/certificates`
- `GET /api/admin/hackathons/:hackathonId/certificates/:participantId/download`

Participant certificate APIs:

- `GET /api/hackathons/:hackathonId/certificate`
- `GET /api/hackathons/:hackathonId/certificate/download`

The certificate collection creates a unique `{ hackathonId, participantId }` index. Failed
certificates can be retried from the admin dashboard; participant download URLs are short-lived and
are issued only after the authenticated account is matched to its own certificate.

## Security note

Never commit `.env`. If a MongoDB password was shared in chat or committed, rotate it in Atlas.
