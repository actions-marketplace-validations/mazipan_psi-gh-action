const core = require('@actions/core')
const io = require('@actions/io')

const { CONSTANT } = require('./constants')
const { green, blue, yellow, newline } = require('./logger')
const { getInputList, isHaveTodayReport, getTodayReportData, logDataToConsole } = require('./utils')
const { callPageSpeed } = require('./callPageSpeed')
const { pushGitChanges } = require('./github/pushGitChanges')
const { setGitComments } = require('./github/setGitComments')

async function main () {
  green('🐯 "psi-github-action" starting to collect report...')

  const urls = getInputList('urls')
  const devices = getInputList('devices') || 'mobile'
  const runs = core.getInput('runs') || 1
  const token = core.getInput('token')
  const override = core.getInput('override')

  if (!token) {
    core.setFailed('"token" is required, please add your PSI API KEY')
  }

  // prepare report folder
  io.mkdirP(CONSTANT.REPORT_DIR)
  // collect as array, so we can use for of
  const arrRuns = []
  for (let index = 0; index < parseInt(runs, 10); index++) {
    arrRuns.push(index)
  }

  let allResponse = []

  const runPSI = async () => {
    for (const url of urls) {
      for (const device of devices) {
        // eslint-disable-next-line no-unused-vars
        for (const _runIdx of arrRuns) {
          const response = await callPageSpeed(
            url.trim(),
            device.trim(),
            core.getInput('api_key').trim()
          )
          allResponse = allResponse.concat([], [response])
        }
      }
    }
  }

  const isReportExist = await isHaveTodayReport()

  let isNeedToPushBack = false
  // will always run psi when override is set
  if (override && override === 'true') {
    blue('ℹ️  Start running PSI because "override" config is "true"')
    newline()
    isNeedToPushBack = true
    await runPSI()
  } else {
    // only run psi when report is NOT exist
    if (!isReportExist) {
      blue('ℹ️  Start running PSI because "override" config is "false" but the report can not be found')
      newline()
      isNeedToPushBack = true
      await runPSI()
    } else {
      yellow('⚠️  Not running PSI because "override" config is "false" and report was generated before')
      newline()
      const existingReport = await getTodayReportData()
      allResponse = existingReport.reports
    }
  }

  const finalResponse = {
    timestamp: new Date(),
    reports: allResponse
  }

  logDataToConsole(finalResponse)

  const isPushBack = core.getInput('push_back')
  if (isPushBack && isPushBack === 'true') {
    const branch = core.getInput('branch')
    if (isNeedToPushBack) {
      // only push when running PSI job
      await pushGitChanges(finalResponse, token, branch)
    }
    await setGitComments(finalResponse, token)
  }
}

main()
  .catch((err) => {
    core.setFailed(err.message)
    process.exit(1)
  })
  .then(() => {
    green(`✅  Completed in ${process.uptime()}s.`)
    process.exit()
  })
