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

_Version denotes the the latest version available the time of writing, may or may not work with lower version._

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
├─ backend/
│  ├─ app/                     # Backend application codes
│  │  ├─ api/                  # Backend API routers
│  │  ├─ core/                 # Backend core codes
│  │  ├─ schemas/              # Backend pydantic schemas
│  │  ├─ services/             # Backend services codes
│  │  ├─ templates/            # Backend HTML templates
│  │  ╰─ main.py               # Backend entrypoint
│  ├─ tests/                   # Backend test codes
│  ├─ .env                     # Backend environment variables
│  ├─ pyproject.toml           # Backend Project manifest
│  ╰─ uv.lock                  # Python uv lock file
├─ database/                   # Database related files
├─ frontend/                   # Frontend codes
├─ .pre-commit-config.yaml     # Pre-commit configuration
╰─ README.md                   # Project README
```

## Environment Variables

The following list all variables that are reads from the environment.

**Backend** (`backend/.env`)

```dotenv
# The application name
APP_NAME=
# The frontend application site url
APP_FRONTEND_URL=
# The database connection string
APP_DATABASE_URL=

# The test database connection string
TEST_DATABASE_URL=

# System user
APP_SYSTEM_USER_NAME=
APP_SYSTEM_USER_EMAIL=
APP_SYSTEM_USER_PASSWORD=

# The secret key used to sign the authentication token
JWT_SECRET_KEY=
JWT_ALGORITHM=
JWT_EXPIRE_MINUTES=

# The AWS region to use
AWS_REGION=
# The AWS bearer token for authenticating with Bedrock runtime
AWS_BEARER_TOKEN_BEDROCK=
# Bedrock model or inference profile ID
AWS_BEDROCK_MODEL_ID=apac.amazon.nova-lite-v1:0
# The value for randomness and creativity of (LLM) output
AWS_BEDROCK_TEMPERATURE=

# A pair of credentials used to authenticate and
# sign programmatic requests made to AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# A pair of identifier used for the Amazon knowledge bases
# Retrieval-Augmented-Generation (RAG)
AWS_KNOWLEDGE_BASE_ID=
AWS_KNOWLEDGE_BASE_MODEL_ARN=
```

**Frontend** (`frontend/.env`)

```dotenv
# The backend API url
API_URL=
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

### **Backend**

- Sync the backend environnment

  ```sh
   uv sync --directory backend
  ```
- Add dependencies to backend

  ```sh
  uv add --directory backend <package name>
  ```

- Remove dependencies from backend

  ```sh
  uv remove --directory backend <package name>
  ```

- Check backend outdated dependencies

  ```sh
  uv tree --directory backend --outdated --depth 1
  ```

- Run the backend API server in development mode.

  ```sh
  uv run --directory backend fastapi dev --port 8001
  ```
## License

All rights reserved.
