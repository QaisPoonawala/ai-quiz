const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');
const { connectDB, docClient } = require('./config/db');
const Participant = require('./models/Participant');
const Quiz = require('./models/Quiz');

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Redis setup for Socket.IO scaling
const pubClient = new Redis(process.env.REDIS_URL, {
    retryStrategy: (times) => {
        // Stop retrying after 5 attempts
        if (times > 5) {
            console.error('Redis connection failed after multiple attempts');
            return null;
        }
        // Exponential backoff
        return Math.min(times * 50, 2000);
    },
    maxRetriesPerRequest: 3
});

const subClient = pubClient.duplicate();

// Add error handlers
pubClient.on('error', (err) => {
    console.error('Redis Pub Client Error:', err);
});

subClient.on('error', (err) => {
    console.error('Redis Sub Client Error:', err);
});

const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    adapter: createAdapter(pubClient, subClient)
});

// Health check endpoint for AWS
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Connect to database
connectDB();

// Share io instance with Express app
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/quiz', require('./routes/quizRoutes'));
app.use('/api/live', require('./routes/liveQuizRoutes'));

// WebSocket handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('host-quiz', async ({ quizId }) => {
        try {
            socket.join(quizId.toString());
            // Get current participant count
            const quiz = await Quiz.findById(quizId);
            const participants = await Participant.findByQuizId(quizId);
            const participantCount = participants.filter(p => p.connected).length;
            io.to(quizId.toString()).emit('participant-count', { count: participantCount });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('join-quiz', async ({ sessionId }) => {
        try {
            const participants = await Participant.findBySessionId(sessionId);
            const participant = participants[0];
            if (!participant) {
                socket.emit('error', 'Invalid session');
                return;
            }

            const quiz = await Quiz.findById(participant.quizId);
            if (!quiz || !quiz.isLive) {
                socket.emit('error', 'Quiz not active');
                return;
            }

            socket.join(quiz.id.toString());
            await Participant.update(participant.id, { 
                connected: true, 
                socketId: socket.id 
            });

            // Update participant count
            const allParticipants = await Participant.findByQuizId(quiz.id);
            const participantCount = allParticipants.filter(p => p.connected).length;
            io.to(quiz.id.toString()).emit('participant-count', { count: participantCount });

            if (quiz.currentQuestion >= 0) {
                socket.emit('quiz-joined', {
                    currentQuestion: quiz.currentQuestion,
                    questionStartTime: quiz.questionStartTime,
                    question: quiz.questions[quiz.currentQuestion],
                    timeLimit: quiz.questions[quiz.currentQuestion].timeLimit
                });
            } else {
                socket.emit('quiz-joined', {
                    currentQuestion: -1
                });
            }
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('submit-answer', async ({ sessionId, answer, timeTaken }) => {
        try {
            const participants = await Participant.findBySessionId(sessionId);
            const participant = participants[0];
            if (!participant) {
                socket.emit('error', 'Invalid session');
                return;
            }

            const quiz = await Quiz.findById(participant.quizId);
            if (!quiz || !quiz.isLive) {
                socket.emit('error', 'Quiz not active');
                return;
            }

            const currentQuestion = quiz.questions[quiz.currentQuestion];
            const isCorrect = currentQuestion.options[answer].isCorrect;
            
            // Calculate points based on time taken (max 1000 points)
            const points = isCorrect ? Math.max(
                100,
                Math.round(1000 - ((timeTaken / currentQuestion.timeLimit) * 900))
            ) : 0;

            // Update participant score and answers
            const newScore = (participant.score || 0) + points;
            const newAnswer = {
                questionIndex: quiz.currentQuestion,
                answeredAt: new Date().toISOString(),
                isCorrect,
                timeTaken,
                points
            };

            await Participant.update(participant.id, {
                score: newScore,
                answers: [...(participant.answers || []), newAnswer]
            });

            // Update leaderboard
            const allParticipants = await Participant.findByQuizId(quiz.id);
            const leaderboard = allParticipants
                .map(p => ({
                    name: p.name,
                    score: p.score || 0,
                    answeredQuestions: (p.answers || []).length,
                    correctAnswers: (p.answers || []).filter(a => a.isCorrect).length
                }))
                .sort((a, b) => b.score - a.score);

            io.to(quiz.id.toString()).emit('leaderboard-update', leaderboard);

        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const participants = await Participant.findBySocketId(socket.id);
            const participant = participants[0];
            if (participant) {
                await Participant.update(participant.id, { 
                    connected: false, 
                    lastActive: new Date().toISOString() 
                });

                // Update participant count
                const allParticipants = await Participant.findByQuizId(participant.quizId);
                const participantCount = allParticipants.filter(p => p.connected).length;
                io.to(participant.quizId.toString()).emit('participant-count', { count: participantCount });
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });
});

const PORT = process.env.PORT || 5001;

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
