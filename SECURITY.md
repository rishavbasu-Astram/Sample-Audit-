# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **DO NOT** create a public GitHub issue
2. Email security concerns to: [your-email@example.com]
3. Include detailed steps to reproduce
4. Allow time for assessment before public disclosure

## Security Features

This project implements:
- RBAC (Role-Based Access Control)
- Input validation and sanitization
- Audit logging
- Data encryption (simulated in prototype)

## Known Limitations

This is a prototype/demo application. For production use:
- Implement real authentication (OAuth, SSO)
- Add rate limiting
- Enable CSRF protection
- Use HTTPS-only cookies
- Implement proper secret management
