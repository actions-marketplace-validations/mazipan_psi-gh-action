const core = require('@actions/core')
const io = require('@actions/io')

const { CONSTANT } = require('./constants')
const { green, blue, yellow, newline } = require('./logger')
const { getInputList, isHaveTodayReport, isContainsZeroPerformance, getTodayReportData, logDataToConsole, generateCommentString } = require('./utils')
const { callPageSpeed } = require('./callPageSpeed')
const { pushGitChanges } = require('./github/pushGitChanges')
const { setGitComments } = require('./github/setGitComments')
const { setActionSummary } = require('./github/setActionSummary')

async function main () {
  green('🐯 "psi-github-action" starting to collect report...')

  const urls = getInputList('urls')
  const devices = getInputList('devices')
  const runs = core.getInput('runs') || 1
  const max = core.getInput('max') || 10
  const apiKey = core.getInput('api_key')
  const ghToken = core.getInput('token')
  const override = core.getInput('override')
  const branch = core.getInput('branch')
  const pushBack = core.getInput('push_back')

  const isPushBack = pushBack && pushBack === 'true'
  const isOverride = override && override === 'true'

  if (!apiKey) {
    core.setFailed('"api_key" is required, please add your PSI API KEY')
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
    const allPromises = []
    for (const url of urls) {
      for (const device of devices) {
        // eslint-disable-next-line no-unused-vars
        for (const _runIdx of arrRuns) {
          const response = callPageSpeed({
            url: url.trim(),
            device: device.trim(),
            apiKey: apiKey.trim()
          })
          allPromises.push(response)
        }
      }
    }

    allResponse = allResponse.concat([], (await Promise.all(allPromises)))
  }

  const isReportExist = await isHaveTodayReport()

  let isNeedToPushBack = false
  // will always run psi when override is set
  if (isOverride) {
    blue('ℹ️  Start running PSI because "override" config is "true"')
    newline()
    isNeedToPushBack = true
    await runPSI()
    newline()
  } else {
    // only run psi when report is NOT exist
    if (!isReportExist) {
      blue(
        'ℹ️  Start running PSI because "override" config is "false" but the report can not be found'
      )
      newline()
      isNeedToPushBack = true
      await runPSI()
      newline()
    } else {
      yellow(
        '⚠️  Not running PSI because "override" config is "false", report you seen here is using existing file'
      )
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

  if (isPushBack) {
    if (isNeedToPushBack) {
      // only push when running PSI job
      const isContainsZero = isContainsZeroPerformance(finalResponse)
      await pushGitChanges({
        data: finalResponse,
        token: ghToken.trim(),
        branch: branch.trim(),
        max: parseInt(max, 10),
        isContainsZero
      })
    }

    const commentBody = generateCommentString(finalResponse)
    await setGitComments({
      commentBody: commentBody,
      token: ghToken.trim()
    })

    await setActionSummary({
      commentBody: commentBody,
      token: ghToken.trim()
    })
  }
}

main()
  .catch((err) => {
    core.setFailed(err.message)
    process.exit(1)
  })
  .then(() => {
    newline()
    green(`✅  Completed in ${process.uptime()}s.`)
    process.exit()
  })
