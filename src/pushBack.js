const github = require('@actions/github')
const core = require('@actions/core')
const exec = require('@actions/exec')
const io = require('@actions/io')
const fs = require('fs')
const { formatDate, createSuccessStatus } = require('./utils')

const TODAY = formatDate(new Date())
const REPORT_DIR = 'psi-reports'
const LAST_UPDATE_FILE = `${REPORT_DIR}/LAST_UPDATED.txt`
const REPORT_FILE = `${REPORT_DIR}/report-${TODAY}.json`
const ALL_REPORT_FILE = `${REPORT_DIR}/available-reports.json`

exports.pushBack = async function pushBack (data, stringComments, token, branch) {
  core.info('> Trying to push_back to the repository...')
  const context = github.context
  const actionUrl = `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
  const remoteRepo = `https://${context.actor}:${token}@github.com/${context.repo.owner}/${context.repo.repo}.git`

  io.mkdirP(REPORT_DIR)
  fs.writeFileSync(LAST_UPDATE_FILE, `${new Date().toISOString()}`)
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(data, null, 2)}`)

  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((file) => file !== 'LAST_UPDATED.txt' && file !== 'available-reports.json')
    .reverse()

  const newAllReportContents = {
    latest: `report-${TODAY}.json`,
    all: files
  }

  fs.writeFileSync(ALL_REPORT_FILE, `${JSON.stringify(newAllReportContents, null, 2)}`)

  await exec.exec('git config --local user.email "actions@github.com"')
  await exec.exec('git config --local user.name "Github Actions"')
  await exec.exec(`git add ${LAST_UPDATE_FILE} ${REPORT_FILE} ${ALL_REPORT_FILE}`)
  await exec.exec('git commit -m "chore(psi-gh-action): generated report file"')

  let nextCommitHash = ''
  await exec.exec('git rev-parse HEAD', [], {
    listeners: {
      stdout: (data) => {
        nextCommitHash += data.toString()
      }
    }
  })

  core.info(`> Next commit hash: ${nextCommitHash}`)

  const cmd = `git push "${remoteRepo}" HEAD:${branch} --follow-tags --force`
  await exec.exec(`${cmd}`)

  const octokit = github.getOctokit(token)
  try {
    core.info(`> Trying to create comment on commit: ${context.sha}`)
    await octokit.repos.createCommitComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      commit_sha: context.sha,
      body: `
  **PSI Report by 🐯 "psi-github-action":**
  ${stringComments}
      `
    })
  } catch (error) {
    core.info(error)
  }

  // status for current commit
  await createSuccessStatus({
    context,
    octokit,
    hash: context.sha,
    url: actionUrl
  })

  // status for next auto commit by this action
  await createSuccessStatus({
    context,
    octokit,
    hash: nextCommitHash,
    url: actionUrl
  })
}
