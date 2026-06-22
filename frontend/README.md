# SmartShop Frontend

Modern React POS + ERP frontend for SmartShop.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS (dark/light mode)
- Zustand (state management)
- Axios (API layer)
- React Router v7
- Recharts (dashboard charts)
- Lucide React (icons)

## Getting Started

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

App runs at `http://localhost:5173`

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | `http://localhost:8000/api/v1` |

## Project Structure

```
src/
├── components/   # Reusable UI + layout components
├── hooks/        # Custom hooks (theme, keyboard shortcuts)
├── layouts/      # Dashboard & POS layouts
├── pages/        # Route pages
├── services/     # Axios API layer
├── store/        # Zustand stores
├── types/        # TypeScript types
└── utils/        # Helpers + mock data
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## Docker

```bash
# From project root
docker compose -f docker-compose.yml up frontend
```

## Keyboard Shortcuts (POS)

| Shortcut | Action |
|---|---|
| `F2` | Focus barcode scanner |
| `Ctrl+F4` | Clear cart |
| `Ctrl+F9` | Checkout |
