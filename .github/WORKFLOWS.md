# GitHub Actions Workflows

This repository includes comprehensive CI/CD workflows to ensure code quality and reliability.

## Workflows Overview

### 1. Test Suite (`test.yml`)
**Triggers:** Push to `main`/`develop`, Pull Requests
- Runs tests on Node.js 18.x and 20.x
- Generates coverage reports
- Uploads coverage to Codecov (optional)
- Runs build verification

### 2. Continuous Integration (`ci.yml`) 
**Triggers:** Push to `main`, Pull Requests to `main`
- Comprehensive testing with coverage
- Security audit with `npm audit`
- Build artifact generation
- Test result reporting

### 3. Pull Request Checks (`pr-checks.yml`)
**Triggers:** PR opened/updated on `main`/`develop`
- Quick test execution
- Automated PR comments with results
- Bundle size checking
- Build verification

## Test Coverage

Current test coverage:
- **Overall:** 88.34% statements, 85.33% branches, 91.66% functions
- **Components:** 100% coverage
- **Pages:** 90.07% coverage  
- **Integration:** Full Supabase mocking and testing

## Required Secrets

For full functionality, configure these repository secrets:

### Optional Secrets
- `CODECOV_TOKEN` - For coverage reporting (optional)
- `NEXT_PUBLIC_SUPABASE_URL` - For production builds (uses placeholder in CI)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - For production builds (uses placeholder in CI)

## Scripts Available

```bash
npm test           # Run tests once
npm run test:watch # Run tests in watch mode
npm run test:ci    # Run tests in CI mode with coverage
npm run build      # Build the application
```

## Workflow Features

### ✅ Automated Testing
- All 53 tests run on every PR and push
- Multiple Node.js versions tested
- Coverage reporting with detailed metrics

### ✅ Security Scanning  
- `npm audit` runs on every CI build
- Vulnerability reports uploaded as artifacts
- High/critical vulnerabilities fail the build

### ✅ Build Verification
- Next.js build tested on every change
- Build artifacts archived for review
- Bundle size monitoring

### ✅ PR Integration
- Automated status checks
- Test result comments on PRs
- Build verification before merge

## Status Badges

Add these to your README.md:

```markdown
![Tests](https://github.com/YOUR_USERNAME/lekh/workflows/Test%20Suite/badge.svg)
![CI](https://github.com/YOUR_USERNAME/lekh/workflows/Continuous%20Integration/badge.svg)
```

## Troubleshooting

### Tests Failing in CI
- Check Node.js version compatibility
- Verify all dependencies in `package.json`
- Review Jest configuration in `jest.config.js`

### Build Failures
- Ensure environment variables are set
- Check Next.js configuration
- Verify all imports are correct

### Coverage Issues
- Review `collectCoverageFrom` patterns in Jest config
- Add tests for uncovered code paths
- Check for missing test files

## File Structure

```
.github/
├── workflows/
│   ├── test.yml          # Multi-version testing
│   ├── ci.yml            # Full CI pipeline
│   └── pr-checks.yml     # PR-specific checks
└── WORKFLOWS.md          # This documentation
```

The workflows ensure every code change is thoroughly tested and built before merging, maintaining high code quality and reliability.