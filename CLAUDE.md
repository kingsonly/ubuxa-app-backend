# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
- `npm run build` - Build the application
- `npm run start:dev` - Start development server with hot reload
- `npm run start:debug` - Start development server with debug mode
- `npm run start:prod` - Start production server

### Code Quality
- `npm run lint` - Run ESLint and fix issues
- `npm run format` - Format code with Prettier

### Testing
- `npm test` - Run unit tests
- `npm run test:watch` - Run unit tests in watch mode
- `npm run test:cov` - Run tests with coverage
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:e2e:watch` - Run e2e tests in watch mode

### Database
- `npx prisma generate` - Generate Prisma client (run after schema changes)
- `npx prisma db seed` - Seed database with initial data
- `npx prisma studio` - Open Prisma Studio for database inspection

## Architecture Overview

### Multi-Tenant SaaS Application
This is a multi-tenant energy management platform with the following key characteristics:

**Multi-Tenancy Model**: Each tenant represents a separate company/organization with isolated data and custom configurations. Users can belong to multiple tenants with different roles per tenant.

**Domain Architecture**: 
- **Tenant Context**: Every request is scoped to a tenant via middleware (`src/tenant/tenant.middleware.ts`)
- **User-Tenant Relationships**: Users are linked to tenants through `UserTenant` model with specific roles
- **Data Isolation**: All business entities (products, sales, customers, etc.) are tenant-scoped

### Core Business Domains

**Authentication & Authorization**:
- JWT-based authentication with tenant-aware JWT strategy
- Role-based access control (RBAC) with granular permissions
- Permission system using action-subject pairs (e.g., `read:Sales`, `manage:all`)
- Multi-level authorization: Admin guards, role guards, and tenant middleware

**Energy Management**:
- **Products**: Solar panels, batteries, and energy devices
- **Inventory**: Stock management with batch tracking
- **Sales**: Customer purchases and payment processing
- **Contracts**: Service agreements and payment terms
- **Devices**: IoT device management with token-based access control

**Customer Management**:
- Customer profiles with location tracking
- Agent-customer relationships
- Payment history and installment tracking

**Payment Processing**:
- Integration with Flutterwave payment gateway
- Subscription management for tenants
- Installment payment tracking

### Database Schema Architecture

**Prisma with MongoDB**: Uses Prisma ORM with MongoDB, featuring a schema folder structure:
- `prisma/schema/` - Modular schema files by domain
- Key relationships: User ↔ UserTenant ↔ Tenant ↔ Role ↔ Permission

**Multi-Store Support**: Tenants can operate single or multiple stores with role-based access control per store.

### Technology Stack

**Backend Framework**: NestJS with TypeScript
- Modular architecture with domain-driven design
- Dependency injection and decorators
- Global validation and transformation pipes
- Swagger API documentation

**Key Integrations**:
- **BullMQ**: Job queue processing with Redis
- **Cloudinary**: File upload and storage
- **Nodemailer**: Email service with Handlebars templates
- **Throttling**: Rate limiting for API protection
- **Cron Jobs**: Scheduled tasks for background processing

### Code Organization

**Module Structure**: Each domain has its own module with:
- `*.controller.ts` - API endpoints
- `*.service.ts` - Business logic
- `*.module.ts` - Module configuration
- `dto/` - Data transfer objects
- `entities/` - Database entities

**Shared Utilities**:
- `src/utils/` - Common utilities (encryption, helpers, pagination)
- `src/constants/` - Application constants and messages
- `src/mailer/` - Email templates and service

### Testing Strategy

**Unit Tests**: Service and controller tests using Jest
**E2E Tests**: Full API testing with supertest
**Test Structure**: 
- `src/**/*.spec.ts` - Unit tests
- `test/**/*.e2e-spec.ts` - End-to-end tests
- Mock data in `test/mockData/`

### Environment Configuration

**Config Management**: Uses `@nestjs/config` for environment variables
**Key Variables**:
- `DATABASE_URL` - MongoDB connection string
- `JWT_SECRET_KEY` - JWT signing secret
- `REDIS_URL` - Redis connection for job queues
- `ALLOWED_ORIGINS` - CORS configuration

### API Documentation

**Swagger Integration**: Automatic API documentation at `/api-docs`
**Authentication**: Bearer token authentication configured
**Versioning**: API versioned with `/api/v1` prefix

## Development Notes

### Multi-Tenant Considerations
- Always ensure tenant context is properly set in requests
- Use tenant-scoped database queries
- Be aware of cross-tenant data leakage prevention

### Permission System
- Use `@RolesAndPermissions()` decorator for endpoint authorization
- Permissions follow `action:subject` pattern
- Admin and super-admin roles have universal access

### Database Queries
- Use Prisma client for all database operations
- Leverage Prisma's type safety and auto-completion
- Include proper error handling for database operations

### File Uploads
- Cloudinary integration for image/file storage
- Use multer for file upload handling
- Validate file types and sizes appropriately

### Email System
- Handlebars templates in `src/mailer/templates/`
- Nodemailer configuration for email sending
- Template-based email generation

### Background Jobs
- Use BullMQ for asynchronous processing
- Redis required for job queue functionality
- Implement proper job error handling and retry logic