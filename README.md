# Amiga VIVO

Intelligent VendorInvoice-to-Voucher Processing

## Requirements

| Name                                      | Version  | Description                        |
| ----------------------------------------- | -------- | ---------------------------------- |
| [Git](https://git-scm.com/)               | v2.53.0  | Distributed version control system |
| [Python](https://www.python.org/)         | v3.14    | Programming language               |
| [pre-commit](https://pre-commit.com/)     | v4.7.0   | Pre-commit hooks manager           |
| [uv](https://docs.astral.sh/uv/)          | v0.13.0  | Python package and project manager |
| [Node.js](https://nodejs.org/)            | v26.11.1 | JavaScript runtime environment     |                            |
| [pnpm](https://pnpm.io/)                  | v12.11.2 | Node.js package manager            |
| [PostgreSQL](https://www.postgresql.org/) | v18.6    | Relational Database                |

> Version denotes the the latest version available the time of writing, may or may not work with lower version.

## Installation

- **Requirements**

  > *Refer to the homepage or official documentation for each pre-requisites for install instruction.*

- **Backend**

  > —TBA—

- **Frontend**

  > —TBA—

## Project Structure

```
<ROOT>/
├─ backend/                    # Backend codes
├─ database/                   # Database related files
├─ frontend/                   # Frontend codes
├─ .pre-commit-config.yaml     # Pre-commit configuration
╰─ README.md                   # Project README
```

## Environment Variables

The following list all variables that are reads from the environment.

**Backend** (`backend/.env`)

```dotenv
—TBA—
```

**Frontend** (`frontend/.env`)

```dotenv
—TBA—
```

## Development

The following list all commands that are often used in development. Ensure the following conditions are satisfied:

- Some command read settings from the environment variables. Make sure've you set the required environment variables with their appropriate value.

- All commands are assumed to be run from the `<root>` project directory

### Workspace

- Clone the Amiga VIVO git repository to local folder.

  ```sh
  git clone https://github.com/amiga-ai/vivo.git
  ```

- Install `pre-commit`to git hooks

  ```sh
  pre-commit install
  ```


## License

All rights reserved.

---
