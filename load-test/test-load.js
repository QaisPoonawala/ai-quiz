const io = require('socket.io-client');
const fetch = require('node-fetch');

// Configuration
const NUM_PARTICIPANTS = 50;
const SERVER_URL = 'http://localhost:5001';
const DELAY_BETWEEN_JOINS = 100; // ms
const ANSWER_TIME_MIN = 1000; // ms
const ANSWER_TIME_MAX = 5000; // ms

// Store participants
const participants = [];

// Random name generator
function generateName() {
    const names = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan'];
    const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];
    return `${names[Math.floor(Math.random() * names.length)]} ${surnames[Math.floor(Math.random() * surnames.length)]}`;
}

// Random delay between min and max
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

// Create a participant
async function createParticipant(sessionCode, index) {
    try {
        // Join quiz
        const joinResponse = await fetch(`${SERVER_URL}/api/live/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionCode,
                name: `Test Participant ${index + 1} - ${generateName()}`
            })
        });

        const joinData = await joinResponse.json();
        if (!joinData.success) {
            throw new Error(`Failed to join quiz: ${joinData.error}`);
        }

        // Connect socket
        const socket = io(SERVER_URL);
        
        // Store participant info
        const participant = {
            socket,
            sessionId: joinData.data.sessionId,
            quizId: joinData.data.quizId,
            name: joinData.data.name
        };

        // Socket event handlers
        socket.on('connect', () => {
            console.log(`Participant ${index + 1} connected`);
            socket.emit('join-quiz', { sessionId: participant.sessionId });
        });

        socket.on('new-question', async (data) => {
            // Random delay before answering
            const delay = randomDelay(ANSWER_TIME_MIN, ANSWER_TIME_MAX);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Submit random answer
            const answer = Math.floor(Math.random() * data.question.options.length);
            try {
                await fetch(`${SERVER_URL}/api/live/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: participant.sessionId,
                        answer,
                        timeTaken: delay / 1000
                    })
                });
            } catch (error) {
                console.error(`Participant ${index + 1} failed to submit answer:`, error);
            }
        });

        socket.on('error', (error) => {
            console.error(`Participant ${index + 1} socket error:`, error);
        });

        participants.push(participant);
        console.log(`Created participant ${index + 1}`);
    } catch (error) {
        console.error(`Failed to create participant ${index + 1}:`, error);
    }
}

// Main test function
async function runLoadTest(sessionCode) {
    console.log('Starting load test...');
    console.time('Load test duration');

    // Create participants with delay between each
    for (let i = 0; i < NUM_PARTICIPANTS; i++) {
        await createParticipant(sessionCode, i);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOINS));
    }

    console.log('All participants created');
    console.timeEnd('Load test duration');

    // Keep the script running
    process.stdin.resume();

    // Cleanup on exit
    process.on('SIGINT', async () => {
        console.log('Cleaning up...');
        participants.forEach(p => p.socket.disconnect());
        process.exit();
    });
}

// Get session code from command line
const sessionCode = process.argv[2];
if (!sessionCode) {
    console.error('Please provide a session code');
    process.exit(1);
}

// Run the test
runLoadTest(sessionCode);
