# School Management System

A comprehensive school management system built with React, Node.js, SQLite, Tailwind CSS, and Redux Toolkit.

## Features

- **New Admission**: Add and manage student admissions with complete details
- **Fee Structure Management**: Create and manage different fee structures
- **Class Group Management**: Organize students into class groups
- **Invoice Management**: Generate and track monthly fee invoices
- **Dashboard**: Overview of all statistics and key metrics

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Redux Toolkit
- **Backend**: Node.js, Express
- **Database**: SQLite with better-sqlite3
- **Build Tool**: Vite

## Getting Started

### Prerequisites

- Node.js >= 22.12.0
- npm >= 9.0.0

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

This will start both the backend API server (port 4000) and the frontend development server (port 5173).

### Default Login Credentials

- Email: `admin@school.com`
- Password: `admin123`

## Available Scripts

- `npm run dev` - Start both backend and frontend in development mode
- `npm run client` - Start only the frontend development server
- `npm run server` - Start only the backend API server
- `npm run build` - Build the application for production
- `npm start` - Start the production server

## Database

The application uses SQLite as the database. The database file is created automatically at `server/data/school.db` when you first run the application.

### Database Schema

- **users** - System users
- **students** - Student records with admission details
- **class_groups** - Different class groups/grades
- **fee_structures** - Fee structure templates
- **invoices** - Monthly fee invoices
- **invoice_items** - Additional charges or discounts on invoices

## Project Structure

```
schoolsystem/
├── server/              # Backend API
│   ├── db.js           # Database setup and schema
│   ├── app.js          # Express app configuration
│   ├── index.js        # Server entry point
│   └── routes/         # API routes
├── src/                # Frontend application
│   ├── app/            # Redux store and slices
│   ├── components/     # Reusable components
│   ├── layout/         # Layout components
│   ├── pages/          # Page components
│   ├── routes/         # Routing configuration
│   ├── services/       # API services
│   └── types.ts        # TypeScript type definitions
└── public/             # Static assets
```

## Features in Detail

### Student Management (New Admission)
- Add new student admissions
- Edit existing student records
- Delete students
- Track student details including roll number, parents name, contact, etc.
- Assign fee structure and class group

### Fee Structure Management
- Create multiple fee structures
- Edit fee amounts and descriptions
- Delete unused fee structures
- Automatically apply to new admissions

### Class Group Management
- Create and organize class groups
- Edit class group details
- Delete unused class groups
- Assign students to appropriate groups

### Invoice Management
- Generate monthly invoices for students
- Track payment status (pending/paid)
- Mark invoices as paid with payment date
- Filter invoices by student, month, year, or status
- Delete invoices

### Dashboard
- Total student count
- Invoice statistics
- Revenue tracking
- Quick overview of system status

## License

This project is created for educational and business purposes.
