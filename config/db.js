const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config();

// Configure AWS credentials and region
const config = {
    region: process.env.AWS_REGION || 'us-east-1'
};

// Add credentials for non-local environments
if (process.env.NODE_ENV !== 'development') {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        console.error('Missing AWS credentials. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
        process.exit(1);
    }
    
    config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
}

// Add endpoint for local development
if (process.env.NODE_ENV === 'development') {
    config.endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
    // For local development, we can use dummy credentials
    config.credentials = {
        accessKeyId: 'local',
        secretAccessKey: 'local'
    };
}

// Create DynamoDB client with enhanced logging
const client = new DynamoDBClient({
    ...config,
    logger: {
        debug: (message) => console.debug(`[DynamoDB Debug] ${message}`),
        info: (message) => console.info(`[DynamoDB Info] ${message}`),
        warn: (message) => console.warn(`[DynamoDB Warn] ${message}`),
        error: (message) => console.error(`[DynamoDB Error] ${message}`)
    }
});

// Create DocumentClient with retry and error handling
const docClient = DynamoDBDocumentClient.from(client, {
    retryStrategy: {
        maxAttempts: 3,
        async isRetryableError(error) {
            console.warn(`Checking retryable error: ${error.name}`);
            return (
                error.name === 'ProvisionedThroughputExceededException' ||
                error.name === 'ThrottlingException' ||
                error.name === 'RequestLimitExceeded' ||
                error.name === 'InternalServerError'
            );
        }
    }
});

const connectDB = async () => {
    try {
        // Verify connection by listing tables
        const { ListTablesCommand } = require('@aws-sdk/client-dynamodb');
        const response = await client.send(new ListTablesCommand({}));
        
        console.log('DynamoDB Connected Successfully');
        console.log('Available Tables:', response.TableNames);
        
        return docClient;
    } catch (error) {
        console.error('DynamoDB Connection Error Details:');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        
        // Provide more specific error guidance
        if (error.name === 'CredentialsProviderError') {
            console.error('AWS Credentials Error: Check your AWS access key and secret key');
        } else if (error.name === 'ConfigurationError') {
            console.error('Configuration Error: Check your AWS region and endpoint settings');
        }
        
        process.exit(1);
    }
};

module.exports = {
    connectDB,
    docClient,
    client
};
