"""CLIP の埋め込みと、種類の当て。

`analyze(絵) -> (埋め込み, {種類: 確からしさ}, 見栄え 0〜1)` を持つものなら何でも差し替えられる。
本番は `OpenClip`（open_clip の ViT-B-32・LAION の重み。どちらも MIT）。見張りは偽物を渡す。

**種類は文で当てる（ゼロショット）。** 1つの種類に文を2つずつ持たせ、その平均と比べる。
文を英語にしているのは、ViT-B-32 が英語の文で学習されているから。
"""

from __future__ import annotations

import importlib
import math
import operator

CATEGORIES: dict[str, list[str]] = {
    "sightseeing": ["a photo of a famous tourist attraction", "a photo of a landmark"],
    "street": ["a photo of a city street", "a photo of an old town alley"],
    "building": ["a photo of a historic building", "a photo of a church or a castle"],
    "nature": ["a photo of nature with trees and flowers", "a photo of a park or a forest"],
    "sea": ["a photo of the sea or a beach", "a photo of a lake or a river"],
    "mountain": ["a photo of mountains", "a photo of a mountain landscape"],
    "lodging": ["a photo of a hotel room", "a photo of a bed in a guesthouse"],
    "food": ["a photo of food on a plate", "a photo of a meal at a restaurant"],
    "shop": ["a photo of a shop", "a photo of a market stall"],
    "vehicle": ["a photo of a train, a bus or an airplane", "a photo taken inside a train or an airplane"],
    "daily": ["a casual everyday snapshot", "a photo of everyday things"],
    "people": ["a photo of a person", "a selfie"],
    "screenshot": ["a screenshot of a phone screen", "a screenshot of an app or a web page"],
    "document": ["a photo of a document with text", "a photo of a ticket or a passport"],
    "receipt": ["a photo of a receipt", "a photo of a printed bill"],
    "screen": ["a photo of a computer monitor", "a photo of a laptop or a TV screen"],
}
AESTHETIC = ["a beautiful, well composed travel photo", "a blurry, badly composed, boring photo"]

JA = {
    "sightseeing": "観光地", "street": "街並み", "building": "建物", "nature": "自然", "sea": "海・湖",
    "mountain": "山", "lodging": "宿", "food": "食事", "shop": "店", "vehicle": "乗り物",
    "daily": "日常", "people": "人", "screenshot": "スクショ", "document": "書類",
    "receipt": "レシート", "screen": "画面",
}


def softmax(xs: list[float]) -> list[float]:
    m = max(xs)
    e = [math.exp(x - m) for x in xs]
    s = sum(e)
    return [x / s for x in e]


class OpenClip:
    """open_clip の ViT-B-32。CPU で1枚ずつ。"""

    def __init__(self, model: str = "ViT-B-32", pretrained: str = "laion2b_s34b_b79k", threads: int = 2):
        import open_clip  # type: ignore
        import torch  # type: ignore

        torch.set_num_threads(threads)
        self.torch = torch
        self.model, _, self.pre = open_clip.create_model_and_transforms(model, pretrained=pretrained)
        self.model.eval()
        tok = open_clip.get_tokenizer(model)
        self.name = f"openclip:{model}:{pretrained}"
        with torch.no_grad():
            self.cats = list(CATEGORIES)
            rows = []
            for k in self.cats:
                t = self.model.encode_text(tok(CATEGORIES[k]))
                t = t / t.norm(dim=-1, keepdim=True)
                m = t.mean(dim=0)
                rows.append(m / m.norm())
            self.text = torch.stack(rows)
            a = self.model.encode_text(tok(AESTHETIC))
            self.aes = a / a.norm(dim=-1, keepdim=True)

    def analyze(self, img):
        torch = self.torch
        with torch.no_grad():
            x = self.pre(img).unsqueeze(0)
            v = self.model.encode_image(x)
            v = v / v.norm(dim=-1, keepdim=True)
            logits = (100.0 * v @ self.text.T)[0].tolist()
            al = (100.0 * v @ self.aes.T)[0].tolist()
        probs = dict(zip(self.cats, softmax(logits)))
        return v[0].tolist(), probs, softmax(al)[0]


def load(spec: str | None):
    """`openclip`・`openclip:<model>:<pretrained>`・`<module>:<attr>`（見張りの偽物など）。"""
    spec = spec or "openclip"
    if spec == "openclip" or spec.startswith("openclip:"):
        parts = spec.split(":")
        return OpenClip(*parts[1:3]) if len(parts) >= 3 else OpenClip()
    mod, _, attr = spec.partition(":")
    return getattr(importlib.import_module(mod), attr)()


def cos(a, b) -> float:
    """両方とも長さ1にしてあるので内積だけ。"""
    return sum(map(operator.mul, a, b))
