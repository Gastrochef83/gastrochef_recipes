# GastroChef Next - System Architecture

## High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API    │    │   Database      │
│                 │    │                  │    │                 │
│  Next.js App    │◄──►│  Next.js API     │◄──►│   PostgreSQL    │
│  (React/TS)     │    │  Routes          │    │   Prisma ORM    │
│  TailwindCSS    │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌──────────────────┐             │
         └─────────────►│ Authentication   │◄────────────┘
                        │ (Supabase Auth)  │
                        └──────────────────┘
```

## Data Flow Diagram

```
User Request
     │
     ▼
Authentication Check
     │
     ▼
Kitchen ID Extraction
     │
     ▼
Permission Validation
     │
     ▼
Database Query (with kitchen_id filter)
     │
     ▼
Row Level Security Enforcement
     │
     ▼
Response Generation
     │
     ▼
Return to Client
```

## Component Structure

### Frontend Components
- Layout components (Header, Sidebar, Footer)
- Authentication components (Login, Register, Profile)
- Dashboard components (KPI cards, Charts)
- Ingredient management components
- Recipe builder components
- Cost calculation panels
- Print layout components

### Backend Components
- API routes for all CRUD operations
- Authentication middleware
- Authorization middleware
- Cost calculation service
- Recipe processing service
- File upload handlers
- Audit logging service

### Database Components
- User and profile tables
- Kitchen and role management
- Ingredients with cost calculations
- Recipes with hierarchical structure
- Cost history tracking
- Audit logs with triggers