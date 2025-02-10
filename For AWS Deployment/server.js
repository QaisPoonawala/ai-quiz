const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');
const connectDB = require('./config/db');
const Participant = require('./models/Participant');
const Quiz = require('./models/Quiz');

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Redis setup for Socket.IO scaling
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();

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
            const participantCount = await Participant.countDocuments({ 
                quizId: quizId,
                connected: true 
            });
            io.to(quizId.toString()).emit('participant-count', { count: participantCount });
        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('join-quiz', async ({ sessionId }) => {
        try {
            const participant = await Participant.findOne({ sessionId });
            if (!participant) {
                socket.emit('error', 'Invalid session');
                return;
            }

            const quiz = await Quiz.findById(participant.quizId);
            if (!quiz || !quiz.isLive) {
                socket.emit('error', 'Quiz not active');
                return;
            }

            socket.join(quiz._id.toString());
            participant.connected = true;
            participant.socketId = socket.id;
            await participant.save();

            // Update participant count
            const participantCount = await Participant.countDocuments({ 
                quizId: quiz._id,
                connected: true 
            });
            io.to(quiz._id.toString()).emit('participant-count', { count: participantCount });

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
            const participant = await Participant.findOne({ sessionId });
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

            participant.score += points;
            participant.answers.push({
                questionIndex: quiz.currentQuestion,
                answeredAt: new Date(),
                isCorrect,
                timeTaken,
                points
            });
            await participant.save();

            // Update leaderboard
            const leaderboard = await Participant.find({ quizId: quiz._id })
                .select('name score answers')
                .sort('-score');

            io.to(quiz._id.toString()).emit('leaderboard-update', leaderboard.map(p => ({
                name: p.name,
                score: p.score,
                answeredQuestions: p.answers.length,
                correctAnswers: p.answers.filter(a => a.isCorrect).length
            })));

        } catch (error) {
            socket.emit('error', error.message);
        }
    });

    socket.on('disconnect', async () => {
        try {
            const participant = await Participant.findOne({ socketId: socket.id });
            if (participant) {
                participant.connected = false;
                participant.lastActive = new Date();
                await participant.save();

                // Update participant count
                const participantCount = await Participant.countDocuments({ 
                    quizId: participant.quizId,
                    connected: true 
                });
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
