param([int]$RunId = 0)
$runs = if ($RunId) { @([pscustomobject]@{ id = $RunId; name = "run-$RunId" }) } else { (Invoke-RestMethod -Uri "https://api.github.com/repos/farazkazmi700-syed/POS/actions/runs?per_page=20").workflow_runs | Where-Object { $_.name -eq 'Deploy web to Cloudflare Pages' } | Select-Object -First 1 }
Write-Output "Inspecting run $($run.id) ($($run.name) @ $($run.head_sha))"
$jobs = Invoke-RestMethod -Uri "https://api.github.com/repos/farazkazmi700-syed/POS/actions/runs/$($run.id)/jobs"
foreach ($job in $jobs.jobs) {
  Write-Output "JOB: $($job.name) => $($job.conclusion)"
    foreach ($step in $job.steps) { Write-Output ("  step: {0} => {1}" -f $step.name, $step.conclusion) }
}
