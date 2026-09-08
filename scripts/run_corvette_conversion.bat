@echo off
"%~dp0..\.tools\blender-4.5.9-windows-x64\blender.exe" --background --python "%~dp0convert_vehicle.py" -- "%USERPROFILE%\Downloads\uploads_files_3981490_Corvette_Grand_Sport.fbx" "%~dp0..\public\assets\corvette-c7-grand-sport.glb" 80000 > "%~dp0..\corvette-convert.out.log" 2>&1
