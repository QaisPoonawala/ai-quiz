const socket = io();
let currentQuizId = null;
let allQuizzes = [];

// Toggle between sections
function showQuizzes() {
    document.getElementById('quizList').style.display = 'block';
    document.getElementById('quizForm').style.display = 'none';
    document.getElementById('liveQuizControl').style.display = 'none';
    loadQuizzes();
}

function showQuizForm() {
    document.getElementById('quizList').style.display = 'none';
    document.getElementById('quizForm').style.display = 'block';
    document.getElementById('liveQuizControl').style.display = 'none';
}

// Load quizzes
async function loadQuizzes() {
    try {
        const response = await fetch('/api/quiz');
        const data = await response.json();
        allQuizzes = data.data;
        filterAndDisplayQuizzes();
    } catch (error) {
        console.error('Error:', error);
    }
}

// Filter and display quizzes
function filterAndDisplayQuizzes() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    const filteredQuizzes = allQuizzes.filter(quiz => 
        quiz.title.toLowerCase().includes(searchTerm) ||
        quiz.description.toLowerCase().includes(searchTerm)
    );
    
    const container = document.getElementById('quizzesContainer');
    container.innerHTML = filteredQuizzes.length ? filteredQuizzes.map(quiz => `
        <div class="quiz-card">
            <h3>${quiz.title}</h3>
            <p>${quiz.description}</p>
            <div class="quiz-controls">
                <button onclick="viewQuiz('${quiz._id}')">View</button>
                <button onclick="copyQuiz('${quiz._id}')">Copy</button>
                <button onclick="startLiveQuiz('${quiz._id}')">Start Live</button>
                <button onclick="deleteQuiz('${quiz._id}')">Delete</button>
            </div>
        </div>
    `).join('') : '<p class="no-results">No quizzes found matching your criteria.</p>';
}

// Add event listeners for search
document.addEventListener('DOMContentLoaded', () => {
    loadQuizzes();
    document.getElementById('searchInput').addEventListener('input', filterAndDisplayQuizzes);
});

// Add question field to form
function addQuestion() {
    const container = document.getElementById('questionsContainer');
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-container';
    questionDiv.innerHTML = `
        <input type="text" placeholder="Question" class="question-text" required>
        <div class="form-group">
            <label>Time Limit (seconds):</label>
            <input type="number" class="time-limit" value="30" min="10" max="300" required>
        </div>
        <div class="form-group">
            <label>Question Image (optional):</label>
            <input type="file" class="question-image" accept="image/*" onchange="handleImageUpload(this)">
            <div class="image-preview"></div>
        </div>
        <div class="options">
            <div class="option">
                <input type="text" placeholder="Option 1" required>
                <input type="checkbox" class="correct-option">
            </div>
            <div class="option">
                <input type="text" placeholder="Option 2" required>
                <input type="checkbox" class="correct-option">
            </div>
            <div class="option">
                <input type="text" placeholder="Option 3" required>
                <input type="checkbox" class="correct-option">
            </div>
            <div class="option">
                <input type="text" placeholder="Option 4" required>
                <input type="checkbox" class="correct-option">
            </div>
        </div>
        <button type="button" onclick="this.parentElement.remove()">Remove Question</button>
    `;
    container.appendChild(questionDiv);
}

// Create quiz
document.getElementById('createQuizForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const quiz = {
        title: document.getElementById('quizTitle').value,
        description: document.getElementById('quizDescription').value,
        theme: {
            backgroundColor: document.getElementById('backgroundColor').value,
            textColor: document.getElementById('textColor').value,
            accentColor: document.getElementById('accentColor').value
        },
        questions: []
    };

    // Get questions
    document.querySelectorAll('.question-container').forEach(questionContainer => {
        const questionText = questionContainer.querySelector('.question-text').value;
        const timeLimit = parseInt(questionContainer.querySelector('.time-limit').value);
        const options = [];
        
        questionContainer.querySelectorAll('.option').forEach(option => {
            options.push({
                text: option.querySelector('input[type="text"]').value,
                isCorrect: option.querySelector('.correct-option').checked
            });
        });

        const imagePreview = questionContainer.querySelector('.image-preview img');
        const imageUrl = imagePreview ? imagePreview.src : null;

        quiz.questions.push({
            questionText,
            timeLimit,
            options,
            imageUrl
        });
    });

    try {
        const response = await fetch('/api/quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(quiz)
        });

        if (response.ok) {
            alert('Quiz created successfully!');
            document.getElementById('createQuizForm').reset();
            showQuizzes();
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error creating quiz');
    }
});

// Copy quiz
async function copyQuiz(id) {
    try {
        const response = await fetch(`/api/quiz/${id}/copy`, {
            method: 'POST'
        });
        const data = await response.json();
        if (response.ok) {
            // Load the copied quiz into edit mode
            const editResponse = await fetch(`/api/quiz/${data.data._id}`);
            const editData = await editResponse.json();
            const quiz = editData.data;

            // Show quiz form
            showQuizForm();

            // Fill form with quiz data
            document.getElementById('quizTitle').value = quiz.title;
            document.getElementById('quizDescription').value = quiz.description;
            document.getElementById('backgroundColor').value = quiz.theme.backgroundColor;
            document.getElementById('textColor').value = quiz.theme.textColor;
            document.getElementById('accentColor').value = quiz.theme.accentColor;

            // Clear existing questions
            document.getElementById('questionsContainer').innerHTML = '';

            // Add each question
            quiz.questions.forEach(question => {
                const container = document.getElementById('questionsContainer');
                const questionDiv = document.createElement('div');
                questionDiv.className = 'question-container';
                questionDiv.innerHTML = `
                    <input type="text" placeholder="Question" class="question-text" value="${question.questionText}" required>
                    <div class="form-group">
                        <label>Time Limit (seconds):</label>
                        <input type="number" class="time-limit" value="${question.timeLimit}" min="10" max="300" required>
                    </div>
                    <div class="form-group">
                        <label>Question Image (optional):</label>
                        <input type="file" class="question-image" accept="image/*" onchange="handleImageUpload(this)">
                        <div class="image-preview">
                            ${question.imageUrl ? `
                                <img src="${question.imageUrl}" alt="Question image">
                                <button type="button" onclick="removeImage(this)" class="remove-image">×</button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="options">
                        ${question.options.map((option, index) => `
                            <div class="option">
                                <input type="text" placeholder="Option ${index + 1}" value="${option.text}" required>
                                <input type="checkbox" class="correct-option" ${option.isCorrect ? 'checked' : ''}>
                            </div>
                        `).join('')}
                    </div>
                    <button type="button" onclick="this.parentElement.remove()">Remove Question</button>
                `;
                container.appendChild(questionDiv);
            });
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error copying quiz');
    }
}

// Start live quiz
async function startLiveQuiz(id) {
    try {
        const response = await fetch(`/api/live/start/${id}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            currentQuizId = id;
            document.getElementById('quizList').style.display = 'none';
            document.getElementById('quizForm').style.display = 'none';
            document.getElementById('liveQuizControl').style.display = 'block';
            
            // Apply theme if available
            const quiz = allQuizzes.find(q => q._id === id);
            if (quiz && quiz.theme) {
                applyTheme(quiz.theme);
            }
            
            document.getElementById('sessionCode').textContent = data.data.sessionCode;
            document.getElementById('currentQuestionNumber').textContent = '0';
            document.getElementById('nextQuestionBtn').textContent = 'Start Quiz';
            document.getElementById('downloadReportBtn').style.display = 'none';
            document.getElementById('endQuizBtn').style.display = 'block';
            
            socket.emit('host-quiz', { quizId: id });
            
            // Generate QR code
            const qrDiv = document.getElementById('qrCode');
            qrDiv.innerHTML = '<h3>Scan to Join</h3>';
            const qrImg = document.createElement('img');
            qrDiv.appendChild(qrImg);
            
            const joinUrl = `${window.location.origin}/join.html`;
            QRCode.toDataURL(joinUrl, function (err, url) {
                if (!err) {
                    qrImg.src = url;
                }
            });
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error starting live quiz');
    }
}

// Timer functionality
let timerInterval;

function startTimer(duration) {
    clearInterval(timerInterval);
    let timeLeft = duration;
    
    const timerDisplay = document.getElementById('timer') || (() => {
        const timer = document.createElement('div');
        timer.id = 'timer';
        document.getElementById('questionControl').insertBefore(
            timer,
            document.getElementById('nextQuestionBtn')
        );
        return timer;
    })();
    
    function updateTimer() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft === 0) {
            clearInterval(timerInterval);
            nextQuestion();
        } else {
            timeLeft--;
        }
    }
    
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

// Next question
async function nextQuestion() {
    try {
        const response = await fetch(`/api/live/next/${currentQuizId}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            if (data.finished) {
                clearInterval(timerInterval);
                document.getElementById('timer')?.remove();
                document.getElementById('nextQuestionBtn').style.display = 'none';
                document.getElementById('downloadReportBtn').style.display = 'block';
                alert('Quiz finished!');
            } else {
                document.getElementById('currentQuestionNumber').textContent = 
                    (data.data.questionIndex + 1).toString();
                document.getElementById('nextQuestionBtn').textContent = 'Next Question';
                
                // Start timer for the new question
                if (data.data.currentQuestion) {
                    startTimer(data.data.currentQuestion.timeLimit);
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error moving to next question');
    }
}

// Download report
async function downloadReport() {
    try {
        const response = await fetch(`/api/quiz/${currentQuizId}/export`);
        const data = await response.json();
        if (data.success) {
            window.open(data.data.downloadUrl, '_blank');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error downloading report');
    }
}

// Show winners
function showWinners(leaderboard) {
    const modal = document.getElementById('winnersModal');
    modal.style.display = 'block';

    // Get top 3 winners
    const winners = leaderboard.slice(0, 3);
    const places = ['firstPlace', 'secondPlace', 'thirdPlace'];

    // Reset winners
    places.forEach(place => {
        const element = document.getElementById(place);
        element.classList.remove('show');
        element.querySelector('.winner-name').textContent = '';
        element.querySelector('.winner-score').textContent = '';
    });

    // Reveal winners one by one
    winners.forEach((winner, index) => {
        setTimeout(() => {
            const place = document.getElementById(places[index]);
            place.querySelector('.winner-name').textContent = winner.name;
            place.querySelector('.winner-score').textContent = `Score: ${winner.score}`;
            place.classList.add('show');
        }, index * 1000);
    });
}

function closeWinnersModal() {
    document.getElementById('winnersModal').style.display = 'none';
    showQuizzes();
}

// End quiz
async function endQuiz() {
    if (confirm('Are you sure you want to end this quiz?')) {
        try {
            const response = await fetch(`/api/quiz/${currentQuizId}/end`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const leaderboard = Array.from(document.querySelectorAll('.leaderboard-entry')).map(entry => ({
                    name: entry.querySelector('.name').textContent,
                    score: parseInt(entry.querySelector('.score').textContent)
                }));
                
                // Download report before showing winners
                await downloadReport();
                
                document.getElementById('liveQuizControl').style.display = 'none';
                showWinners(leaderboard);
                currentQuizId = null;
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error ending quiz');
        }
    }
}

// Delete quiz
async function deleteQuiz(id) {
    if (confirm('Are you sure you want to delete this quiz?')) {
        try {
            const response = await fetch(`/api/quiz/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                loadQuizzes();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

// Quiz Preview Functions
function closeQuizPreview() {
    document.getElementById('quizPreviewModal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('quizPreviewModal');
    if (event.target === modal) {
        closeQuizPreview();
    }
}

// Apply theme to quiz display
function applyTheme(theme) {
    const quizControl = document.getElementById('liveQuizControl');
    if (quizControl && theme) {
        quizControl.style.backgroundColor = theme.backgroundColor;
        quizControl.style.color = theme.textColor;
        
        // Update buttons
        const buttons = quizControl.querySelectorAll('button');
        buttons.forEach(button => {
            button.style.backgroundColor = theme.accentColor;
            button.style.color = '#ffffff';
        });
    }
}

// Handle image upload
function handleImageUpload(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        const preview = input.parentElement.querySelector('.image-preview');
        
        reader.onload = function(e) {
            preview.innerHTML = `
                <img src="${e.target.result}" alt="Question image">
                <button type="button" onclick="removeImage(this)" class="remove-image">×</button>
            `;
        };
        
        reader.readAsDataURL(file);
    }
}

function removeImage(button) {
    const preview = button.parentElement;
    preview.innerHTML = '';
    const fileInput = preview.parentElement.querySelector('.question-image');
    fileInput.value = '';
}

// View quiz
async function viewQuiz(id) {
    try {
        const response = await fetch(`/api/quiz/${id}`);
        const data = await response.json();
        const quiz = data.data;

        // Update modal content
        document.getElementById('previewTitle').textContent = quiz.title;
        document.getElementById('previewQuestionCount').textContent = `Questions: ${quiz.questions.length}`;
        document.getElementById('previewDescription').textContent = quiz.description;

        // Generate questions preview
        const questionsHtml = quiz.questions.map((question, index) => `
            <div class="preview-question">
                <h3>Question ${index + 1}: ${question.questionText}</h3>
                <p>Time Limit: ${question.timeLimit} seconds</p>
                ${question.imageUrl ? `
                    <div class="preview-question-image">
                        <img src="${question.imageUrl}" alt="Question ${index + 1} image">
                    </div>
                ` : ''}
                <ul class="preview-options">
                    ${question.options.map(option => `
                        <li class="preview-option ${option.isCorrect ? 'correct' : ''}">
                            ${option.text} ${option.isCorrect ? '✓' : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');

        document.getElementById('previewQuestions').innerHTML = questionsHtml;
        document.getElementById('quizPreviewModal').style.display = 'block';
    } catch (error) {
        console.error('Error:', error);
        alert('Error loading quiz preview');
    }
}

// Socket.io event handlers
socket.on('participant-count', (data) => {
    if (currentQuizId) {
        document.getElementById('participantNumber').textContent = data.count;
    }
});

socket.on('leaderboard-update', (leaderboard) => {
    if (currentQuizId) {
        const leaderboardList = document.getElementById('liveLeaderboardList');
        leaderboardList.innerHTML = leaderboard
            .map((entry, index) => `
                <div class="leaderboard-entry">
                    <span class="rank">${index + 1}</span>
                    <span class="name">${entry.name}</span>
                    <span class="score">${entry.score}</span>
                </div>
            `)
            .join('');
    }
});

// Load quizzes on page load
document.addEventListener('DOMContentLoaded', loadQuizzes);
