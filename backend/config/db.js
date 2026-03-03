const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.DB_NAME || 'rutina_db',
    });
    console.log(`✔ MongoDB conectado: ${conn.connection.host}`);
  } catch (err) {
    console.error('✘ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
