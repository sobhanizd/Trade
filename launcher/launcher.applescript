-- CryptoPilot Launcher: handles cryptopilot://start and cryptopilot://stop links,
-- so the launcher page (index.html) can turn the local server on and off.
-- Build it with scripts/build-launcher.sh (macOS only).

-- The app lives in <project>/launcher/, so the project folder is two levels up.
on projectDir()
	return do shell script "cd " & quoted form of (POSIX path of (path to me)) & "/../.. && pwd"
end projectDir

on startServer()
	do shell script "/bin/zsh " & quoted form of (projectDir() & "/scripts/start-local.sh") & " > /dev/null 2>&1 &"
end startServer

on stopServer()
	do shell script "/bin/zsh " & quoted form of (projectDir() & "/scripts/stop-local.sh") & " > /dev/null 2>&1 &"
end stopServer

on open location theURL
	if theURL starts with "cryptopilot://stop" then
		stopServer()
	else
		startServer()
	end if
end open location

on run
	startServer()
end run
