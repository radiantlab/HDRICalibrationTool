# -*- mode: python ; coding: utf-8 -*-


block_cipher = None


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('src/user_interface/image_preview.py', 'src/user_interface/image_preview.py'), ('src/user_interface/image_uploader.py', 'src/user_interface/image_uploader.py'), ('src/user_interface/ui_main.py', 'src/user_interface/ui_main.py'), ('src/user_interface/upload_file_region.py', 'src/user_interface/upload_file_region.py'), ('src/user_interface/upload_image_region.py', 'src/user_interface/upload_image_region.py'), ('src/assets', 'src/assets'), ('src/styles', 'src/styles'), ('src/progress_window.py', 'src/progress_window.py'), ('submodules/radiance_pipeline', 'submodules/radiance_pipeline')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='HDRICalibrationTool-windows',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='HDRICalibrationTool-windows',
)
