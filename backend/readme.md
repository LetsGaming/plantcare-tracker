# PlantCare Tracker - Backend

## Overview
The backend of the **PlantCare Tracker** project is responsible for managing user authentication, plant data, and plant care schedules. It provides a RESTful API for the frontend to interact with plant and user data.

## Features
- User Authentication (Register, Login)
- CRUD operations for plants (Create, Read, Update, Delete)
- Plant care scheduling
- Notifications for plant watering and care

## Technology Stack
- **Node.js** with **Express.js**
- **MySQL** for database
- **JWT** for user authentication
- **Postman** for API testing

## Project Setup

### Prerequisites
- Node.js
- MySQL

### Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/LetsGaming/plantcare-tracker.git
    cd plantcare-tracker/backend
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Create a `.env` file with the following variables:
    ```bash
    PORT=5000

    # MySQL Database configuration
    DB_HOST=localhost
    DB_USER=plantcare-db-admin
    DB_PASSWORD=your_password
    DB_NAME=your_db_name

    # JWT configuration
    JWT_SECRET=your_jwt_secret 
    JWT_REFRESH_SECRET=your_jwt_refresh_secret
    ```

4. Start the server:
    ```bash
    npm start
    ```

The server will run at `http://localhost:5000`.

## API Documentation
WiP

## Contributing
Feel free to open issues or contribute via pull requests. 
