# Contributing to Enterprise Financial Management System

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

### Prerequisites

- Node.js 18.17+ (LTS recommended)
- npm 9.x+ or yarn
- Git

### Development Setup

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/financial-management-system.git
cd financial-management-system

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev

# 5. Open http://localhost:3000
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── ui/          # Shadcn UI primitives
│   ├── dashboard/   # Dashboard-specific components
├── data/            # Mock data layer
├── store/           # Zustand state management
├── types/           # TypeScript type definitions
└── lib/             # Utility functions
```

## How to Contribute

### 1. Find or Create an Issue

- Check existing issues for `good first issue` or `help wanted` labels
- Create a new issue if you found a bug or have a feature request
- Wait for maintainer approval before starting work

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

### 3. Make Changes

- Follow the existing code style
- Write TypeScript with strict types
- Use Tailwind CSS for styling
- Add components to `src/components/`
- Add pages to `src/app/`

### 4. Test Your Changes

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Build for production
npm run build
```

### 5. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

**Commit Message Format:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:
- Clear title and description
- Reference to related issue (`Closes #123`)
- Screenshots if UI changes

## Code Style Guidelines

### TypeScript
- Use strict mode
- Define interfaces for all props
- Avoid `any` type
- Use union types for status enums

### Components
- Use functional components
- Use `"use client"` only when needed
- Keep components under 200 lines
- Extract reusable logic to hooks

### Styling
- Use Tailwind CSS utility classes
- Follow the design system colors
- Use `cn()` utility for conditional classes
- Maintain responsive design

## Areas for Contribution

### High Priority
- [ ] Replace mock data with real API integration
- [ ] Add unit tests (Vitest + React Testing Library)
- [ ] Implement form validation (Zod + React Hook Form)
- [ ] Add error boundaries and loading states

### Medium Priority
- [ ] Dark mode support
- [ ] Internationalization (i18n)
- [ ] Accessibility improvements (a11y)
- [ ] Mobile responsiveness enhancements

### Low Priority
- [ ] Additional chart types
- [ ] Export to Excel format
- [ ] Print styles for reports
- [ ] Keyboard shortcuts

## Questions?

- Open a Discussion on GitHub
- Check existing documentation in `docs/`
- Review closed issues for similar questions

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on what's best for the community
- Show empathy towards others

Thank you for contributing!
