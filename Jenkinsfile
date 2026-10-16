// Builds, checks and publishes the three images of this repository:
//   configurator-portal, workflow-manager-ui, process-orchestrator-ui
// Image names: ${dockerRegistry}/${dockerRepo}/${project}/<image>:<version>
// The version comes from ./package.json ("-snapshot" is added on develop).
pipeline {

    agent {
      label 'onboarding'
    }

    environment {
        // CHANGE VARIABLES TO YOUR PROJECT
        //-----------------------------------------
        project = "radix"
        sonarUrl = "http://ci.dev.multicert.com/sonar/"
        sonarProjectKeyPrefix = "config-ui"
        sonarProjectNamePrefix = "config-ui"
        sonarProjectNameSuffix = "branch"
        dockerRegistry = "nexus:8443"
        dockerRepo = "multicert"
        httpsProxy = "http://proxy.multicert.dev:8080"
        noProxy = "localhost,multicert.inet,multicert.dev,forge.multicert.inet,ssl_ev_oa2,*.multicert.dev,*.pipelines.multicert.dev,*.dev.multicert.com"
        httpProxy = "http://proxy.multicert.dev:8080"
        // Jenkins job that deploys DEV; leave empty to skip the deploy stage
        deployDevJob = ""
        //-----------------------------------------
        // Jenkins "Secret text" credential holding the Sonar token
        SONAR_TOKEN = credentials('sonar-token')
        // the images, each built from the folder of the same name
        images = "configurator-portal workflow-manager-ui process-orchestrator-ui"
        // the Angular apps, whose unit tests run before the images are built
        apps = "workflow-manager-ui process-orchestrator-ui"
    }

    options {
        buildDiscarder(logRotator(artifactDaysToKeepStr: '', artifactNumToKeepStr: '', daysToKeepStr: '3', numToKeepStr: '5'))
        disableConcurrentBuilds()
    }

    stages {

      stage('Init and Check Version') {
        steps {
          script {
              def command="""sed 's/.*"version": "\\(.*\\)".*/\\1/;t;d' ./package.json"""
              env.version = sh(returnStdout: true, script: command).trim();
              env.versionSonar = env.version + "." + currentBuild.number

              env.sonarProjectName = env.sonarProjectNamePrefix + " " + env.BRANCH_NAME.replaceAll("/(.*)", "") + " " + env.sonarProjectNameSuffix
              env.sonarProjectKey = env.sonarProjectKeyPrefix + "-" + env.BRANCH_NAME.replaceAll("/(.*)", "")

              if (env.BRANCH_NAME == "develop") {
                  env.version = env.version + "-snapshot"
              }

              echo "Project version: ${version}"
          }

          sh "docker version"
        }
      }

      // Unit tests (vitest + jsdom) of both Angular apps, in a throwaway Node container.
      // Runs as the agent's user so the files it leaves in the workspace can be deleted afterwards.
      stage('Unit Tests') {
        steps {
          script {
            for (app in env.apps.split(' ')) {
              sh """docker run --rm --user \$(id -u):\$(id -g) \
                 -e HOME=/tmp -e CI=true \
                 -e HTTP_PROXY='${httpProxy}' -e HTTPS_PROXY='${httpsProxy}' -e NO_PROXY='${noProxy}' \
                 -v "\$PWD/${app}":/app -w /app node:24-alpine \
                 sh -c 'npm ci --ignore-scripts --no-audit --no-fund && npx ng test --watch=false'"""
            }
          }
        }
      }

      stage('Sonar') {
        steps {
          sh """docker run --rm --user \$(id -u):\$(id -g) \
             -e SONAR_HOST_URL='${sonarUrl}' -e SONAR_TOKEN \
             -e SONAR_SCANNER_OPTS='-Dhttp.proxyHost=proxy.multicert.dev -Dhttp.proxyPort=8080 -Dhttps.proxyHost=proxy.multicert.dev -Dhttps.proxyPort=8080 -Dhttp.nonProxyHosts=localhost|*.multicert.dev|*.dev.multicert.com|*.multicert.inet' \
             -v "\$PWD":/usr/src sonarsource/sonar-scanner-cli \
             -Dsonar.projectKey='${env.sonarProjectKey}' \
             -Dsonar.projectName='${env.sonarProjectName}' \
             -Dsonar.projectVersion='${env.versionSonar}' \
             -Dsonar.working.directory=/tmp/.scannerwork"""
        }
      }

      stage('Build Docker') {
        steps {
          sh "echo version: ${version}"
          script {
            for (image in env.images.split(' ')) {
              sh "docker build --build-arg HTTP_PROXY='${httpProxy}' \
                 --build-arg HTTPS_PROXY='${httpsProxy}' \
                 --build-arg NO_PROXY='${noProxy}' \
                 ${image} -t ${dockerRegistry}/${dockerRepo}/${project}/${image}:${version}"
            }
          }
        }
      }

      stage('Publish to Docker Repo') {
        steps {
            withDockerRegistry([url: "http://${dockerRegistry}", credentialsId: 'nexus-credentials'])
            {
                script {
                  for (image in env.images.split(' ')) {
                    sh "docker push ${dockerRegistry}/${dockerRepo}/${project}/${image}:${version}"
                  }
                }
            }
        }
      }

      stage('Deploy DEV') {
        when {
          allOf {
            branch "develop"
            expression { env.deployDevJob?.trim() }
          }
        }
          steps {
              script {
                for (image in env.images.split(' ')) {
                  build job: env.deployDevJob, wait: true, parameters:[string(name: 'REQUESTED_ACTION', value: image)]
                }
              }
          }
      }
    }


    post {
        always {
            // remove the images built here, then the workspace
            script {
              for (image in env.images.split(' ')) {
                sh "docker image rm ${dockerRegistry}/${dockerRepo}/${project}/${image}:${version} || true"
              }
            }
            deleteDir()
        }
    }
}
