# Contributing to Ulti-Project

Thank you for your interest in contributing to Ulti-Project! We appreciate your effort and to ensure that your contributions are integrated smoothly, please follow these guidelines.

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages. Our repository uses Commitlint and cz-commitizen to enforce these commit guidelines.

Here's an example of a commit message: `feat(user): add ability to delete account`

In this example, `feat` is the type of change, `user` is the scope of the change, and `add ability to delete account` is a brief description of the change.

### Commit Message Format

Each commit message consists of a **header**, a **body**, and a **footer**. The header has a special format that includes the **type**, **scope**, and **subject**:

- **Type**: Must be one of the following:
  - **build**: Changes that affect the build system or external dependencies
  - **ci**: Changes to our CI configuration files and scripts
  - **docs**: Documentation only changes
  - **feat**: A new feature
  - **fix**: A bug fix
  - **perf**: A code change that improves performance
  - **refactor**: A code change that neither fixes a bug nor adds a feature
  - **style**: Changes that do not affect the meaning of the code (white-space, formatting, etc)
  - **test**: Adding missing tests or correcting existing tests

- **Subject**: The subject contains a succinct description of the change:
  - use the imperative, present tense: "change" not "changed" nor "changes"
  - don't capitalize the first letter
  - no dot (.) at the end

- **Body** (optional): Just as in the subject, use the imperative, present tense. The body should include the motivation for the change and contrast this with previous behavior.

- **Footer** (optional): The footer should contain any information about Breaking Changes and is also the place to reference GitHub issues that this commit Closes.

### Using Commitizen

`pnpm commit` will prompt you to fill in any required fields and will also allow you to optionally fill in any optional fields.
