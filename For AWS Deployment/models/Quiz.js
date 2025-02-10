const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    theme: {
        backgroundColor: {
            type: String,
            default: '#ffffff'
        },
        textColor: {
            type: String,
            default: '#333333'
        },
        accentColor: {
            type: String,
            default: '#007bff'
        }
    },
    description: {
        type: String,
        required: true
    },
    questions: [{
        questionText: {
            type: String,
            required: true
        },
        imageUrl: {
            type: String
        },
        options: [{
            text: {
                type: String,
                required: true
            },
            isCorrect: {
                type: Boolean,
                required: true
            }
        }],
        timeLimit: {
            type: Number,  // in seconds
            required: true,
            default: 30
        }
    }],
    isLive: {
        type: Boolean,
        default: false
    },
    currentQuestion: {
        type: Number,
        default: -1  // -1 means quiz hasn't started
    },
    questionStartTime: {
        type: Date
    },
    sessionCode: {
        type: String,
        unique: true,
        sparse: true
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Participant'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    originalQuizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz'
    },
    archived: {
        type: Boolean,
        default: false
    },
    activeParticipants: [{
        participantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Participant'
        },
        score: {
            type: Number,
            default: 0
        },
        name: String
    }],
    archivedResults: [{
        participantName: String,
        score: Number,
        completedAt: Date
    }]
});

module.exports = mongoose.model('Quiz', quizSchema);
