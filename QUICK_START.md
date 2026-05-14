# Quick Start Guide

## Getting Started

Your school management system is ready to use!

### 1. Start the Application

Run this command to start both the backend server and frontend:

```bash
npm run dev
```

This will start:
- Backend API server on **http://localhost:4000**
- Frontend app on **http://localhost:5173**

### 2. Login

Open your browser and go to **http://localhost:5173**

Use these credentials to login:
- **Email**: `admin@school.com`
- **Password**: `admin123`

## Features Overview

### Dashboard
View overview statistics including:
- Total students
- Total and pending invoices
- Revenue tracking

### New Admission (Students Page)
- Add new student admissions with complete details
- Fields: Name, Parents Name, Contact No., Roll No., Fee Structure (dropdown), Class Group (dropdown), Date of Birth, Address
- View all students in a table
- Edit or delete student records

### Fee Structure
- Create different fee structures (Basic, Standard, Premium, etc.)
- Set monthly fee amounts
- Manage descriptions
- These fee structures appear in the dropdown when adding students

### Class Groups
- Create class groups (Grade 1, Grade 2, etc.)
- Organize students into classes
- These class groups appear in the dropdown when adding students

### Invoices
- Generate monthly invoices for students
- Select student, month, year, and due date
- Automatically uses the student's assigned fee structure amount
- Mark invoices as paid with payment date
- View all invoices with status tracking (pending/paid/overdue)
- Filter invoices by student, month, year, or status

## Sample Data

The system comes with pre-seeded data:
- 5 Class Groups (Grade 1-5)
- 3 Fee Structures with Registration Fee, Annual Charges, Monthly Fee, and Meals
- 1 Admin user

## Project Structure

```
schoolsystem/
├── server/              # Backend (Node.js + Express)
│   ├── db.js           # SQLite database setup
│   ├── app.js          # Express configuration
│   ├── index.js        # Server entry point
│   └── routes/         # API endpoints
│       └── api.js
├── src/                # Frontend (React + TypeScript)
│   ├── pages/          # Main pages
│   │   ├── DashboardPage.tsx
│   │   ├── StudentsPage.tsx
│   │   ├── FeeStructuresPage.tsx
│   │   ├── ClassGroupsPage.tsx
│   │   └── InvoicesPage.tsx
│   ├── components/     # Reusable components
│   ├── layout/         # Layout components
│   ├── services/       # API integration
│   └── app/            # Redux store
```

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Redux Toolkit
- **Backend**: Node.js, Express
- **Database**: SQLite (stored in `server/data/school.db`)
- **Build Tool**: Vite

## Common Commands

```bash
npm run dev      # Start both backend and frontend
npm run client   # Start only frontend
npm run server   # Start only backend
npm run build    # Build for production
```

## Tips

1. Always start with creating Fee Structures and Class Groups first
2. Then add students with their assigned fee structure and class group
3. Generate invoices monthly for each student
4. Track payments by marking invoices as paid

## Database Location

The SQLite database is automatically created at:
`server/data/school.db`

All your data is stored here locally.

## Need Help?

Check the main README.md file for more detailed documentation.
