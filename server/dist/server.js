import express from 'express';
import schedule from 'node-schedule';
import logger from './logger.js';
import { connectFranken, disconnectFranken } from './8sleep/frankenServer.js';
import { FrankenMonitor } from './8sleep/frankenMonitor.js';
import { ButtonMonitor } from './8sleep/buttonMonitor.js';
import { seedHeatState } from './8sleep/heatState.js';
import { wait } from './8sleep/promises.js';
import './jobs/jobScheduler.js';
// Setup code
import setupMiddleware from './setup/middleware.js';
import setupRoutes from './setup/routes.js';
import config from './config.js';
import serverStatus from './serverStatus.js';
import { prisma } from './db/prisma.js';
import { loadWifiSignalStrength } from './8sleep/wifiSignalStrength.js';
import { startComfortMonitoring } from './jobs/comfort.js';
const port = 3000;
const app = express();
let server;
let frankenMonitor;
let buttonMonitor;
async function disconnectPrisma() {
    try {
        logger.debug('Flushing SQLite');
        // Flush WAL into main DB and truncate WAL file (no-op if not in WAL mode)
        await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
        logger.debug('Flushed SQLite');
    }
    catch (error) {
        logger.error('Error flushing SQLite');
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
    }
    try {
        logger.debug('Disconnecting Prisma');
        await prisma.$disconnect();
        logger.debug('Disconnected Prisma');
    }
    catch (error) {
        logger.error('Error disconnecting from Prisma');
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
    }
}
// Graceful Shutdown Function
async function gracefulShutdown(signal) {
    logger.debug(`\nReceived ${signal}. Initiating graceful shutdown...`);
    let finishedExiting = false;
    // Force shutdown after 10 seconds
    setTimeout(() => {
        if (finishedExiting)
            return;
        const error = new Error('Could not close connections in time. Forcing shutdown.');
        logger.error({ error });
        process.exit(1);
    }, 15_000);
    logger.debug('Stopping node-schedule');
    await schedule.gracefulShutdown();
    await disconnectPrisma();
    try {
        if (server) {
            // Stop accepting new connections
            server.close(() => {
                logger.debug('Closed out remaining HTTP connections.');
            });
        }
        if (!config.remoteDevMode) {
            frankenMonitor?.stop();
            buttonMonitor?.stop();
            await disconnectFranken();
            logger.debug('Successfully closed Franken components.');
        }
    }
    catch (err) {
        logger.error(`Error during shutdown: ${err}`);
    }
    finishedExiting = true;
    logger.debug('Exiting now...');
    process.exit(0);
}
// Initialize Franken on server startup
async function initFranken() {
    logger.info('Initializing Franken on startup...');
    serverStatus.status.franken.status = 'started';
    // Force creation of the Franken and FrankenServer so it’s ready before we listen
    await connectFranken();
    serverStatus.status.franken.status = 'healthy';
    serverStatus.status.franken.message = '';
    logger.info('Franken has been initialized successfully.');
}
// connectFranken gives up after 10 attempts (~4 min). Keep retrying so the monitors, buttons
// and comfort jobs still start once the firmware connects, instead of staying off until a restart.
const FRANKEN_INIT_RETRY_MS = 60_000;
async function initFrankenUntilConnected() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            await initFranken();
            return;
        }
        catch (error) {
            serverStatus.status.franken.status = 'failed';
            const message = error instanceof Error ? error.message : String(error);
            serverStatus.status.franken.message = message;
            logger.error(error);
            logger.warn(`Retrying Franken initialization in ${FRANKEN_INIT_RETRY_MS / 1_000}s`);
            await wait(FRANKEN_INIT_RETRY_MS);
        }
    }
}
const initFrankenMonitor = () => {
    logger.info('Starting franken monitor...');
    serverStatus.status.frankenMonitor.status = 'started';
    frankenMonitor = new FrankenMonitor();
    void frankenMonitor.start();
    logger.info('Frank monitor started!');
    // Seed physical heat state from recent journal history, then let ButtonMonitor's
    // poll keep it fresh from the same journal stream.
    seedHeatState();
    buttonMonitor = new ButtonMonitor();
    buttonMonitor.start();
    startComfortMonitoring();
};
// Main startup function
async function startServer() {
    setupMiddleware(app);
    setupRoutes(app);
    // Listen on desired port
    server = app.listen(port, () => {
        logger.debug(`Server running on http://localhost:${port}`);
    });
    serverStatus.status.express.status = 'healthy';
    serverStatus.status.logger.status = 'healthy';
    // Initialize Franken once before listening
    if (!config.remoteDevMode) {
        void initFrankenUntilConnected()
            .then(() => {
            initFrankenMonitor();
        })
            .catch(error => {
            logger.error(error);
        });
    }
    void loadWifiSignalStrength();
    setInterval(loadWifiSignalStrength, 10_000);
    // Register signal handlers for graceful shutdown
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', async (err) => {
        console.error('Uncaught Exception:', err);
        logger.error(err);
        await gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', async (reason, promise) => {
        logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
        await gracefulShutdown('unhandledRejection');
    });
}
// Actually start the server
startServer().catch((err) => {
    logger.error('Failed to start server:', err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map