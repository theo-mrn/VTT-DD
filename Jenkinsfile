pipeline{
    agent any
    stages{
        stage('install dependencies'){
            steps{
                sh 'npm install'
            }
        }
        stage('run test'){
            steps{
                sh 'npm run test'
            }
        }
        stage('run test:e2e'){
            steps{
                sh 'npm run test:e2e'
            }
        }

        stage('test playright'){
            steps{
                sh 'npm run test:playright'
            }
        }
    }
}