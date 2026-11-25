# 从已登录的浏览器里取 Cookie（含 HttpOnly），存成 Cookie 头
import importlib.util, sys, json, types, pathlib

spec = importlib.util.spec_from_file_location("dshb", r"C:\Users\666\.dsh\skills\dsh-browser\scripts\browser.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

args = types.SimpleNamespace(port=9222, index=0)
cdp = mod.connect(args)

res = cdp.cmd("Network.getCookies", {"urls": [
    "https://jw.csuse.edu.cn/jsxsd/framework/xsMainV.htmlx",
    "https://jw.csuse.edu.cn/jsxsd/xskb/xskb_list.do",
    "https://ps.csuse.edu.cn/portal/home",
]})
cookies = res.get("cookies", [])
print("拿到 cookie 数:", len(cookies))
jw = [c for c in cookies if "jw.csuse.edu.cn" in c.get("domain", "")]
ps = [c for c in cookies if "ps.csuse.edu.cn" in c.get("domain", "")]
print("jw 域:", [c["name"] for c in jw])
print("ps 域:", [c["name"] for c in ps])

hdr = "; ".join(f'{c["name"]}={c["value"]}' for c in jw)
pathlib.Path("secrets").mkdir(exist_ok=True)
pathlib.Path("secrets/jw-cookie.txt").write_text(hdr, encoding="utf-8")
json.dump(cookies, open("secrets/all-cookies.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("已写 secrets/jw-cookie.txt")
