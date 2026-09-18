const name = process.argv[2]
if (!name) process.exit(2)

let input = ""
for await (const chunk of process.stdin) input += chunk

const start = input.indexOf("[")
const end = input.lastIndexOf("]")
if (start < 0 || end < start) process.exit(0)

try {
  const resources = JSON.parse(input.slice(start, end + 1))
  const resource = resources.find((item) => item?.name === name)
  process.stdout.write(String(resource?.uuid || resource?.id || resource?.name || ""))
} catch {
  process.exit(0)
}
