Option Explicit
Dim sh, wmi, procs, exe, dir
Set sh = CreateObject("WScript.Shell")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
exe = "C:\GeekLock\GeekLock.exe"
dir = "C:\GeekLock"
Set procs = wmi.ExecQuery("Select * from Win32_Process Where Name='GeekLock.exe'")
If procs.Count = 0 Then
  sh.CurrentDirectory = dir
  sh.Run """" & exe & """", 1, False
End If
WScript.Sleep 2000
sh.AppActivate "GeekLock"
WScript.Sleep 800
sh.AppActivate "GeekLock"
