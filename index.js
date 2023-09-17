const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv } = require("uuid");

const fs = require("fs");
const axios = require("axios");

const app = express();
app.use(express.json());
const currentDateTime = new Date().toISOString();

const dbPath = path.join(__dirname, "users.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//Here i wrote a function to convert image url to binary data to store image into database. But i didn't used.
async function urlToBinaryData(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });
    const binaryData = Buffer.from(response.data);
    return binaryData;
  } catch (error) {
    console.error("Error downloading image:", error);
    return null;
  }
}

//Middleware Function to authenticate user.
// Incase if you are facing any issues while login make sure you are using the correct jwt token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "quardbtech", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//login API - To generate jwt access token
app.post("/login", async (request, response) => {
  const { user_name, user_password } = request.body;
  const selectUserQuery = `SELECT * FROM users WHERE user_name = '${user_name}'`;
  const dbUser = await db.get(selectUserQuery);
  console.log(dbUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
    console.log("invalid at stage 1");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      user_password,
      dbUser.user_password
    );
    if (isPasswordMatched === true) {
      const payload = {
        user_name: user_name,
      };
      const jwtToken = jwt.sign(payload, "quardbtech");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid Password");
      console.log("invalid at stage 2");
    }
  }
});

//GET API
app.get("/details/:user_id", async (request, response) => {
  let { user_id } = request.params;
  let getUserQuery = `SELECT * FROM Users WHERE user_id = ?`;
  let data = await db.get(getUserQuery, [user_id]);
  response.send(data);
});

// INSERT API
app.post("/insert", authenticateToken, async (request, response) => {
  let {
    user_id,
    user_name,
    user_email,
    user_password,
    user_image,
    total_orders,
    created_at,
    last_logged_in,
  } = request.body;
  let user_uuid = uuidv();
  let hashed_password = await bcrypt.hash(user_password, 10);
  let created_time = currentDateTime;
  let last_logged = currentDateTime;

  const checkEmailQuery = "SELECT user_email FROM Users WHERE user_email = ?";
  const existingUser = await db.get(checkEmailQuery, [user_email]);
  if (existingUser) {
    response.status(409).send("Email address already in use");
  } else {
    let insertQuery = `INSERT INTO Users(user_id,user_name,
    user_email,user_password,user_image,total_orders,created_at,last_logged_in)
    VALUES (?,?,?,?,?,?,?,?)`;
    try {
      let data = await db.run(insertQuery, [
        user_uuid,
        user_name,
        user_email,
        hashed_password,
        user_image,
        total_orders,
        created_time,
        last_logged,
      ]);
      response.status(200).send("new user created successfully");
    } catch (e) {
      console.log(e);
    }
  }
});

//UPDATE API
app.put("/update/:user_id", authenticateToken, async (request, response) => {
  let { user_id } = request.params;
  let getUserQuery = `SELECT * FROM Users WHERE user_id = ?`;
  let data = await db.get(getUserQuery, [user_id]);

  if (request.body.user_password !== undefined) {
    let hashedPassword = await bcrypt.hash(request.body.user_password, 10);
    request.body.user_password = hashedPassword;
  } else {
    request.body.user_password = data.user_password;
  }

  if (request.body.user_email !== undefined) {
    let email_check = await db.get(`SELECT * FROM Users WHERE user_email = ?`, [
      request.body.user_email,
    ]);
    if (email_check === undefined) {
      request.body.user_email = request.body.user_email;
    } else {
      response.status(400).send("Email already exists");
    }
  } else {
    request.body.user_email = data.user_email;
  }

  let {
    user_name = data.user_name,
    user_image = data.user_image,
    user_email,
    user_password,
    total_orders = data.total_orders,
    created_at = data.created_at,
    last_logged_in = data.last_logged_in,
  } = request.body;
  let updateQuery = `update Users
                    SET user_name = "${user_name}",
                        user_email = "${user_email}",
                        user_password = "${user_password}",
                        user_image = "${user_image}",
                        total_orders = "${total_orders}",
                        created_at = "${created_at}",
                        last_logged_in = "${currentDateTime}"
                    WHERE user_id = "${user_id}"`;
  let update = db.run(updateQuery);
  response.send("Profile updated successfully");
});

//GET IMAGE API
app.get("/image/:user_id", async (request, response) => {
  let { user_id } = request.params;
  let getUserQuery = `SELECT user_image FROM Users WHERE user_id = ?`;
  let data = await db.get(getUserQuery, [user_id]);
  response.send(data);
});

//DELETE API
app.delete("/delete/:user_id", async (request, response) => {
  let { user_id } = request.params;
  let deleteQuery = `DELETE FROM Users WHERE user_id = ?`;
  let data = await db.run(deleteQuery, [user_id]);
  response.send("User Deleted Successfully");
});
