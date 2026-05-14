import app from "./app.js";

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`School Management API ready on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n❌  Port ${PORT} is already in use by another process.\n` +
        `   Run: kill $(lsof -ti :${PORT}) && npm run dev\n`,
    );
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});

// Graceful shutdown function
const gracefulShutdown = (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  
  const shutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
  
  server.close(() => {
    clearTimeout(shutdownTimeout);
    console.log('Server closed');
    process.exit(0);
  });
};

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  server.close(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  server.close(() => {
    process.exit(1);
  });
});
