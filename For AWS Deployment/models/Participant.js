const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    sessionId: {
        type: String,
        required: true
    },
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true
    },
    score: {
        type: Number,
        default: 0
    },
    answers: [{
        questionIndex: Number,
        answeredAt: Date,
        isCorrect: Boolean,
        timeTaken: Number
    }],
    lastActive: {
        type: Date,
        default: Date.now
    },
    connected: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model('Participant', participantSchema);
