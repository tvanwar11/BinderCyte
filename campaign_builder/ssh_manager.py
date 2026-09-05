"""SSH/SCP manager with Duo MFA support via paramiko."""

import os
import threading
import paramiko


class SSHManager:
    def __init__(self):
        self.transport = None
        self.sftp = None
        self.state = "disconnected"
        self.error = None
        self._lock = threading.Lock()

    def connect(self, hostname, port, username, password):
        with self._lock:
            self.state = "authenticating"
            self.error = None
        threading.Thread(
            target=self._connect,
            args=(hostname, port, username, password),
            daemon=True,
        ).start()

    def _connect(self, hostname, port, username, password):
        try:
            t = paramiko.Transport((hostname, port))
            t.connect()

            def auth_handler(title, instructions, prompt_list):
                responses = []
                for prompt_text, _ in prompt_list:
                    if "password" in prompt_text.lower():
                        responses.append(password)
                    else:
                        with self._lock:
                            self.state = "awaiting_mfa"
                        responses.append("1")
                return responses

            t.auth_interactive(username, auth_handler)
            self.transport = t
            self.sftp = paramiko.SFTPClient.from_transport(t)
            with self._lock:
                self.state = "connected"
        except Exception as e:
            with self._lock:
                self.state = "error"
                self.error = str(e)

    def exec_command(self, cmd, timeout=60):
        if self.state != "connected" or not self.transport:
            raise RuntimeError("Not connected")
        chan = self.transport.open_session()
        chan.settimeout(timeout)
        chan.exec_command(cmd)
        stdout = chan.makefile("r").read()
        stderr = chan.makefile_stderr("r").read()
        code = chan.recv_exit_status()
        chan.close()
        return stdout, stderr, code

    def upload_file(self, local_path, remote_path):
        if not self.sftp:
            raise RuntimeError("Not connected")
        if not os.path.isfile(local_path):
            raise FileNotFoundError(f"Local file not found: {local_path}")
        self._mkdir_p(remote_path.rsplit("/", 1)[0])
        self.sftp.put(local_path, remote_path)

    def upload_string(self, content, remote_path):
        if not self.sftp:
            raise RuntimeError("Not connected")
        self._mkdir_p(remote_path.rsplit("/", 1)[0])
        with self.sftp.open(remote_path, "w") as f:
            f.write(content)

    def _mkdir_p(self, path):
        path = path.replace("\\", "/")
        parts = []
        while path and path != "/":
            try:
                self.sftp.stat(path)
                break
            except (IOError, OSError):
                parts.insert(0, path)
                path = path.rsplit("/", 1)[0] if "/" in path else ""
        for p in parts:
            try:
                self.sftp.mkdir(p)
            except (IOError, OSError):
                pass

    def disconnect(self):
        for resource in (self.sftp, self.transport):
            if resource:
                try:
                    resource.close()
                except Exception:
                    pass
        self.sftp = None
        self.transport = None
        with self._lock:
            self.state = "disconnected"
            self.error = None

    def get_status(self):
        with self._lock:
            return {"state": self.state, "error": self.error}
