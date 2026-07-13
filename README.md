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

## Security note

Never commit `.env`. If a MongoDB password was shared in chat or committed, rotate it in Atlas.
