const { execSync } = require("child_process");

// --- Configuration ---
const VERSION_TYPES = ["patch", "minor", "major"];

// --- Helper Function for Executing Shell Commands ---
/**
 * Executes a shell command synchronously and handles errors.
 * @param {string} command The command to execute.
 * @param {string} errorMessage The message to display if the command fails.
 * @returns {string} The trimmed stdout from the command.
 */
function runCommand(command, errorMessage) {
  try {
    return execSync(command, { stdio: "pipe" }).toString().trim();
  } catch (error) {
    console.error(`${errorMessage}:`, error.message);
    process.exit(1);
  }
}

// --- Main Script Logic ---
async function main() {
  const type = process.argv[2];

  // 1. Validate Version Type
  if (!VERSION_TYPES.includes(type)) {
    console.error(
      `Invalid version type: "${type}". Allowed types: ${VERSION_TYPES.join(
        ", "
      )}`
    );
    process.exit(1);
  }

  console.log(
    `Bumping ${type} version in package.json and package-lock.json...`
  );

  // 2. Update package.json and package-lock.json
  const newVersion = runCommand(
    `npm version ${type} --no-git-tag-version`,
    "Failed to bump version"
  );

  console.log(`New version set: ${newVersion}`);

  // 3. Git commit
  const commitMessage = `chore: bump ${type} version to ${newVersion}`;
  console.log("Staging and committing changes...");
  runCommand("git add package.json package-lock.json", "Failed to stage files");
  runCommand(`git commit -m "${commitMessage}"`, "Failed to commit changes");
  console.log(`Commit created: "${commitMessage}"`);

  // 4. Push to GitHub
  console.log("Pushing changes to GitHub...");
  runCommand("git push", "Failed to push changes");
  console.log("Version bump successfully pushed!");
}

// Execute the main function
main();
