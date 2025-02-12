// Global variables
let currentQuizId = null;
let lastQuizId = null;
let allQuizzes = [];

// Function to add a new question to the quiz form
function addQuestion() {
    const questionsContainer = document.getElementById('questionsContainer');
    const questionNumber = questionsContainer.children.length + 1;

    const questionHTML = `
        <div class="question-container">
            <h3>Question ${questionNumber}</h3>
            <div class="form-group">
                <label>Question Text:</label>
                <input type="text" class="question-text" required>
            </div>
            <div class="form-group">
                <label>Time Limit (seconds):</label>
                <input type="number" class="time-limit" value="30" min="5" max="300" required>
            </div>
            <div class="form-group">
                <label>Image (optional):</label>
                <input type="file" class="question-image" accept="image/*" onchange="previewImage(this)">
                <div class="image-preview"></div>
            </div>
            <div class="options-container">
                <h4>Options</h4>
                <div class="option">
                    <input type="text" placeholder="Option 1" required>
                    <label>
                        <input type="checkbox" class="correct-option"> Correct
                    </label>
                </div>
                <div class="option">
                    <input type="text" placeholder="Option 2" required>
                    <label>
                        <input type="checkbox" class="correct-option"> Correct
                    </label>
                </div>
            </div>
            <button type="button" onclick="addOption(this)">Add Option</button>
            <button type="button" class="remove-question" onclick="removeQuestion(this)">Remove Question</button>
        </div>
    `;

    questionsContainer.insertAdjacentHTML('beforeend', questionHTML);
}

// Function to preview uploaded image
function previewImage(input) {
    const preview = input.parentElement.querySelector('.image-preview');
    const file = input.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Question image">`;
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = '';
    }
}

// Function to add a new option to a question
function addOption(button) {
    const optionsContainer = button.previousElementSibling;
    const optionNumber = optionsContainer.children.length + 1;
    
    const optionHTML = `
        <div class="option">
            <input type="text" placeholder="Option ${optionNumber}" required>
            <label>
                <input type="checkbox" class="correct-option"> Correct
            </label>
            <button type="button" onclick="removeOption(this)">Remove</button>
        </div>
    `;
    
    optionsContainer.insertAdjacentHTML('beforeend', optionHTML);
}

// Function to remove an option
function removeOption(button) {
    const option = button.parentElement;
    const optionsContainer = option.parentElement;
    
    if (optionsContainer.children.length > 2) {
        option.remove();
    } else {
        alert('A question must have at least 2 options');
    }
}

// Function to remove a question
function removeQuestion(button) {
    const questionContainer = button.parentElement;
    const questionsContainer = questionContainer.parentElement;
    
    questionContainer.remove();
    
    // Update question numbers
    const questions = questionsContainer.querySelectorAll('.question-container');
    questions.forEach((question, index) => {
        question.querySelector('h3').textContent = `Question ${index + 1}`;
    });
}

// Function to show quiz form
function showQuizForm() {
    document.getElementById('quizList').style.display = 'none';
    document.getElementById('quizForm').style.display = 'block';
    document.getElementById('liveQuizControl').style.display = 'none';
}

// Socket connection
const socket = io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
});

// Connection error handling
socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    alert('Connection error. Please refresh the page.');
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
});

socket.on('reconnect_failed', () => {
    console.error('Failed to reconnect');
    alert('Connection lost. Please refresh the page.');
});

socket.on('participant-count', (data) => {
    const participantCount = document.getElementById('participantNumber');
    const participantNames = document.getElementById('participantNames');
    if (participantCount) {
        participantCount.textContent = data.count;
    }
    if (participantNames && data.participants) {
        participantNames.textContent = data.participants.map(p => p.name).join('\t');
    }
});

socket.on('leaderboard-update', (leaderboardData) => {
    const leaderboardList = document.getElementById('liveLeaderboardList');
    if (leaderboardList) {
        leaderboardList.innerHTML = leaderboardData
            .map((participant, index) => `
                <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}">
                    <span class="rank">${index + 1}</span>
                    <span class="name">${participant.name}</span>
                    <span class="score">${participant.score}</span>
                    <div class="stats">
                        <span class="answered">${participant.answeredQuestions} answered</span>
                        <span class="correct">${participant.correctAnswers} correct</span>
                    </div>
                </div>
            `).join('');
    }
});

// Function to show quiz list
function showQuizzes() {
    document.getElementById('quizList').style.display = 'block';
    document.getElementById('quizForm').style.display = 'none';
    document.getElementById('liveQuizControl').style.display = 'none';
    loadQuizzes();
}

// Function to filter and display quizzes
function filterAndDisplayQuizzes() {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const filteredQuizzes = allQuizzes.filter(quiz => 
        quiz.title.toLowerCase().includes(searchInput) ||
        quiz.description.toLowerCase().includes(searchInput)
    );
    
    const container = document.getElementById('quizzesContainer');
    container.innerHTML = '';
    
    filteredQuizzes.forEach(quiz => {
        const quizCard = `
            <div class="quiz-card">
                <div class="quiz-header">
                    <h3>${quiz.title}</h3>
                    <div class="quiz-actions">
                        <button onclick="startLiveQuiz('${quiz.id}')">Start Live</button>
                        <button onclick="viewQuiz('${quiz.id}')">View</button>
                        <button onclick="editQuiz('${quiz.id}')">Edit</button>
                        <button onclick="copyQuiz('${quiz.id}')">Copy</button>
                        <button onclick="deleteQuiz('${quiz.id}')">Delete</button>
                    </div>
                </div>
                <p>${quiz.description}</p>
                <div class="quiz-meta">
                    <span>${quiz.questions.length} Questions</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', quizCard);
    });
}

// Update all remaining fetch requests to use the correct '/api/quizzes' endpoint
async function loadQuizzes() {
    try {
        const response = await fetch('/api/quiz');
        const data = await response.json();
        allQuizzes = data.data;
        filterAndDisplayQuizzes();
    } catch (error) {
        console.error('Error loading quizzes:', error);
        alert('Failed to load quizzes. Please check the console for details.');
    }
}

// Existing quiz creation code (already updated in previous version)
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

    // Validate title
    if (!quiz.title.trim()) {
        alert('Quiz title is required');
        return;
    }

    // Get questions
    const questionContainers = document.querySelectorAll('.question-container');
    
    if (questionContainers.length === 0) {
        alert('Please add at least one question to the quiz');
        return;
    }

    questionContainers.forEach(questionContainer => {
        const questionText = questionContainer.querySelector('.question-text').value.trim();
        
        if (!questionText) {
            alert('Each question must have a question text');
            return;
        }

        const timeLimit = parseInt(questionContainer.querySelector('.time-limit').value);
        const options = [];
        
        const optionContainers = questionContainer.querySelectorAll('.option');
        const checkedOptions = Array.from(optionContainers).filter(option => 
            option.querySelector('.correct-option').checked
        );

        if (checkedOptions.length === 0) {
            alert('Each question must have at least one correct option');
            return;
        }

        optionContainers.forEach(option => {
            const optionText = option.querySelector('input[type="text"]').value.trim();
            
            if (!optionText) {
                alert('Option text cannot be empty');
                return;
            }

            options.push({
                text: optionText,
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
        console.log('Sending quiz creation request with payload:', JSON.stringify(quiz, null, 2));
        
        const response = await fetch('/api/quiz', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(quiz)
        });

        const responseData = await response.json();

        if (response.ok) {
            console.log('Quiz created successfully:', responseData);
            alert('Quiz created successfully!');
            document.getElementById('createQuizForm').reset();
            document.getElementById('questionsContainer').innerHTML = ''; // Clear questions
            showQuizzes();
        } else {
            console.error('Quiz creation failed:', responseData);
            alert(`Error creating quiz: ${responseData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error creating quiz:', error);
        alert('Error creating quiz. Please check the console for details.');
    }
});

// Update other functions to use '/api/quizzes'
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
            // Show control buttons
            document.getElementById('downloadReportBtn').style.display = 'block';
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
        console.error('Error starting live quiz:', error);
        alert('Error starting live quiz. Please check the console for details.');
    }
}

async function nextQuestion() {
    try {
        const response = await fetch(`/api/live/next/${currentQuizId}`, {
            method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
            if (data.finished) {
                await endQuiz();
                return;
            }

            document.getElementById('currentQuestionNumber').textContent = 
                parseInt(document.getElementById('currentQuestionNumber').textContent) + 1;
            document.getElementById('nextQuestionBtn').textContent = 'Next Question';
        } else {
            console.error('Next question failed:', data);
            alert(`Error moving to next question: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error moving to next question:', error);
        alert('Error moving to next question. Please check the console for details.');
    }
}

async function endQuiz() {
    if (!confirm('Are you sure you want to end this quiz?')) {
        return;
    }

    try {
        console.log('Ending quiz:', currentQuizId);

        // End the quiz and get final data
        const endResponse = await fetch(`/api/quiz/${currentQuizId}/end`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const endData = await endResponse.json();
        
        if (!endData.success) {
            throw new Error('Failed to end quiz');
        }
        
        console.log('Quiz ended successfully:', endData);

        // Hide quiz control panel
        document.getElementById('liveQuizControl').style.display = 'none';

        // Store the quiz ID before resetting currentQuizId
        lastQuizId = currentQuizId;

        // Show winners using the winners data from the end quiz response
        showWinners(endData.data.winners);
        
        // Reset quiz state
        socket.emit('quiz-ended', { quizId: currentQuizId });
        currentQuizId = null;

        console.log('Quiz end process completed');
    } catch (error) {
        console.error('Error ending quiz:', error);
        alert('Error ending quiz. Please check the console for details.');
    }
}

async function downloadReport() {
    try {
        // Use lastQuizId if currentQuizId is null
        const quizId = currentQuizId || lastQuizId;
        if (!quizId) {
            throw new Error('No quiz ID available');
        }

        console.log('Downloading report for quiz:', quizId);
        const response = await fetch(`/api/quiz/${quizId}/export`);
        const data = await response.json();
        if (data.success) {
            window.open(data.data.downloadUrl, '_blank');
        } else {
            console.error('Download report failed:', data);
            alert(`Error downloading report: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error downloading report:', error);
        alert('Error downloading report. Please check the console for details.');
    }
}

// Theme application
function applyTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty('--background-color', theme.backgroundColor || '#ffffff');
    root.style.setProperty('--text-color', theme.textColor || '#333333');
    root.style.setProperty('--accent-color', theme.accentColor || '#007bff');
}

async function editQuiz(id) {
    try {
        const quiz = allQuizzes.find(q => q.id === id);
        if (!quiz) {
            alert('Quiz not found');
            return;
        }

        // Show quiz form
        document.getElementById('quizList').style.display = 'none';
        document.getElementById('quizForm').style.display = 'block';
        document.getElementById('liveQuizControl').style.display = 'none';

        // Fill form with quiz data
        document.getElementById('quizTitle').value = quiz.title;
        document.getElementById('quizDescription').value = quiz.description;
        document.getElementById('backgroundColor').value = quiz.theme?.backgroundColor || '#ffffff';
        document.getElementById('textColor').value = quiz.theme?.textColor || '#333333';
        document.getElementById('accentColor').value = quiz.theme?.accentColor || '#007bff';

        // Add questions
        quiz.questions.forEach(question => {
            const questionsContainer = document.getElementById('questionsContainer');
            const questionNumber = questionsContainer.children.length + 1;

            const questionHTML = `
                <div class="question-container">
                    <h3>Question ${questionNumber}</h3>
                    <div class="form-group">
                        <label>Question Text:</label>
                        <input type="text" class="question-text" value="${question.questionText}" required>
                    </div>
                    <div class="form-group">
                        <label>Time Limit (seconds):</label>
                        <input type="number" class="time-limit" value="${question.timeLimit}" min="5" max="300" required>
                    </div>
                    <div class="form-group">
                        <label>Image (optional):</label>
                        <input type="file" class="question-image" accept="image/*" onchange="previewImage(this)">
                        <div class="image-preview">
                            ${question.imageUrl ? `<img src="${question.imageUrl}" alt="Question image">` : ''}
                        </div>
                    </div>
                    <div class="options-container">
                        <h4>Options</h4>
                        ${question.options.map((option, index) => `
                            <div class="option">
                                <input type="text" placeholder="Option ${index + 1}" value="${option.text}" required>
                                <label>
                                    <input type="checkbox" class="correct-option" ${option.isCorrect ? 'checked' : ''}> Correct
                                </label>
                                ${index > 1 ? '<button type="button" onclick="removeOption(this)">Remove</button>' : ''}
                            </div>
                        `).join('')}
                    </div>
                    <button type="button" onclick="addOption(this)">Add Option</button>
                    <button type="button" class="remove-question" onclick="removeQuestion(this)">Remove Question</button>
                </div>
            `;
            questionsContainer.insertAdjacentHTML('beforeend', questionHTML);
        });

        // Update form submission to handle edit
        const form = document.getElementById('createQuizForm');
        form.onsubmit = async (e) => {
            e.preventDefault();
            await updateQuiz(id);
        };
    } catch (error) {
        console.error('Error editing quiz:', error);
        alert('Error editing quiz. Please check the console for details.');
    }
}

async function updateQuiz(id) {
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

    // Get questions (reusing existing validation logic)
    const questionContainers = document.querySelectorAll('.question-container');
    
    if (questionContainers.length === 0) {
        alert('Please add at least one question to the quiz');
        return;
    }

    questionContainers.forEach(questionContainer => {
        const questionText = questionContainer.querySelector('.question-text').value.trim();
        
        if (!questionText) {
            alert('Each question must have a question text');
            return;
        }

        const timeLimit = parseInt(questionContainer.querySelector('.time-limit').value);
        const options = [];
        
        const optionContainers = questionContainer.querySelectorAll('.option');
        const checkedOptions = Array.from(optionContainers).filter(option => 
            option.querySelector('.correct-option').checked
        );

        if (checkedOptions.length === 0) {
            alert('Each question must have at least one correct option');
            return;
        }

        optionContainers.forEach(option => {
            const optionText = option.querySelector('input[type="text"]').value.trim();
            
            if (!optionText) {
                alert('Option text cannot be empty');
                return;
            }

            options.push({
                text: optionText,
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
        const response = await fetch(`/api/quiz/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(quiz)
        });

        const data = await response.json();

        if (data.success) {
            alert('Quiz updated successfully!');
            document.getElementById('createQuizForm').reset();
            document.getElementById('questionsContainer').innerHTML = '';
            // Reset form submission handler
            document.getElementById('createQuizForm').onsubmit = async (e) => {
                e.preventDefault();
                await createQuiz(e);
            };
            showQuizzes();
        } else {
            console.error('Quiz update failed:', data);
            alert(`Error updating quiz: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error updating quiz:', error);
        alert('Error updating quiz. Please check the console for details.');
    }
}

async function copyQuiz(id) {
    try {
        const response = await fetch(`/api/quiz/${id}/copy`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Quiz copied successfully!');
            loadQuizzes(); // Refresh quiz list
        } else {
            console.error('Copy quiz failed:', data);
            alert(`Error copying quiz: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error copying quiz:', error);
        alert('Error copying quiz. Please check the console for details.');
    }
}

async function deleteQuiz(id) {
    if (!confirm('Are you sure you want to delete this quiz? This action cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`/api/quiz/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.success) {
            alert('Quiz deleted successfully!');
            loadQuizzes(); // Refresh quiz list
        } else {
            console.error('Delete quiz failed:', data);
            alert(`Error deleting quiz: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error deleting quiz:', error);
        alert('Error deleting quiz. Please check the console for details.');
    }
}

function showWinners(leaderboard) {
    try {
        console.log('Showing winners with leaderboard:', leaderboard);
        
        const modal = document.getElementById('winnersModal');
        if (!modal) {
            throw new Error('Winners modal element not found');
        }

        const firstPlace = document.getElementById('firstPlace');
        const secondPlace = document.getElementById('secondPlace');
        const thirdPlace = document.getElementById('thirdPlace');
        const totalParticipants = document.getElementById('totalParticipants');

        if (!firstPlace || !secondPlace || !thirdPlace || !totalParticipants) {
            throw new Error('Required winner elements not found');
        }

        // Reset previous winners
        [firstPlace, secondPlace, thirdPlace].forEach(place => {
            place.classList.remove('show');
            place.querySelector('.winner-name').textContent = '';
            place.querySelector('.winner-score').textContent = '';
            place.querySelector('.winner-rank').textContent = '';
        });

        // Sort leaderboard by score
        const sortedLeaderboard = [...leaderboard].sort((a, b) => b.score - a.score);
        console.log('Sorted leaderboard:', sortedLeaderboard);

        // Update total participants
        totalParticipants.textContent = `Total Participants: ${leaderboard.length}`;

        // Update winners with rankings
        if (sortedLeaderboard.length > 0) {
            firstPlace.querySelector('.winner-name').textContent = sortedLeaderboard[0].name;
            firstPlace.querySelector('.winner-score').textContent = `Score: ${sortedLeaderboard[0].score}`;
            firstPlace.querySelector('.winner-rank').textContent = `Rank: 1/${sortedLeaderboard.length}`;
            firstPlace.classList.add('show');
        }

        if (sortedLeaderboard.length > 1) {
            secondPlace.querySelector('.winner-name').textContent = sortedLeaderboard[1].name;
            secondPlace.querySelector('.winner-score').textContent = `Score: ${sortedLeaderboard[1].score}`;
            secondPlace.querySelector('.winner-rank').textContent = `Rank: 2/${sortedLeaderboard.length}`;
            secondPlace.classList.add('show');
        }

        if (sortedLeaderboard.length > 2) {
            thirdPlace.querySelector('.winner-name').textContent = sortedLeaderboard[2].name;
            thirdPlace.querySelector('.winner-score').textContent = `Score: ${sortedLeaderboard[2].score}`;
            thirdPlace.querySelector('.winner-rank').textContent = `Rank: 3/${sortedLeaderboard.length}`;
            thirdPlace.classList.add('show');
        }

        // Add full leaderboard
        const leaderboardList = document.getElementById('fullLeaderboard');
        if (leaderboardList) {
            leaderboardList.innerHTML = sortedLeaderboard
                .map((participant, index) => `
                    <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}">
                        <span class="rank">${index + 1}</span>
                        <span class="name">${participant.name}</span>
                        <span class="score">${participant.score}</span>
                        <div class="stats">
                            <span class="answered">${participant.answeredQuestions || 0} answered</span>
                            <span class="correct">${participant.correctAnswers || 0} correct</span>
                        </div>
                    </div>
                `).join('');
        }

        // Show modal
        modal.style.display = 'block';
        console.log('Winners modal displayed successfully');
    } catch (error) {
        console.error('Error showing winners:', error);
        alert('Error displaying winners. Please check the console for details.');
    }
}

function closeWinnersModal() {
    const modal = document.getElementById('winnersModal');
    const winners = document.querySelectorAll('.winner');
    winners.forEach(winner => winner.classList.remove('show'));
    modal.style.display = 'none';
    showQuizzes();
}
