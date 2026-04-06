# Project Kickoff Checklist

> Checklist referenced by the planner agent when starting a new project.
> All items below must be verified/decided before coding begins.

## 1. Domain Design

### 1.1 Entity Naming

- [ ] Finalize core entity names (singular English: Prompt, User, Category)
- [ ] DB table names = snake_case plural (prompts, users)
- [ ] URL path names = kebab-case plural (/prompts, /categories)
- [ ] Register any abbreviations in the glossary

### 1.2 Data Model

- [ ] Identify actions that require "who did it" tracking -> design event tables
- [ ] Clearly define 1:N / N:M relationships
- [ ] Decide soft delete strategy (deleted_at vs physical delete)
- [ ] Define audit columns (created_at, updated_at, created_by)
- [ ] Decide PK strategy (UUID vs auto-increment)

### 1.3 Rendering Strategy

- [ ] Pages requiring SEO -> SSR/SSG
- [ ] Pages not requiring SEO -> CSR
- [ ] Specify rendering approach for each major page

### 1.4 Retention Loop

- [ ] Specify at least one reason users return
- [ ] Define the North Star Metric

## 2. Technical Design

### 2.1 Environment Compatibility Matrix

- [ ] Verify OS compatibility (Windows/Mac/Linux)
- [ ] Specify Python/Node.js versions + verify library compatibility
- [ ] Specify DB version
- [ ] Pin Docker image versions

### 2.2 Concurrency Scenarios

- [ ] Identify resources with concurrent writes (likes, view counts, inventory, etc.)
- [ ] Define duplicate prevention strategy (UNIQUE constraints, idempotency keys, etc.)
- [ ] Decide locking strategy (if needed)

### 2.3 ERD

- [ ] Full entity relationship diagram for MVP scope (text or Mermaid)
- [ ] Include FK + index design

### 2.4 Full API List

- [ ] All endpoints: Method + Path + Auth + response_model
- [ ] Classify as public / auth required / admin only
- [ ] Decide versioning strategy (v1/ prefix, etc.)

## 3. Infrastructure & Security

### 3.1 Environment Configuration

- [ ] Finalize .env variable list (write .env.example)
- [ ] Define differences between dev/staging/production environments

### 3.2 Initial Security

- [ ] Rate limiting policy (requests per minute)
- [ ] Request body size limit
- [ ] CORS allowed domains

---

## Completion Criteria

- All items from 1.1 through 2.4 must have a decision or "not needed for this phase" noted
- Results must be reflected in the INTENT.md "Constraints" section
- User approval completed
