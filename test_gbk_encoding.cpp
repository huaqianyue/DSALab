
#include <iostream>
#include <windows.h>
using namespace std;

int main() {
    // 使用默认的GBK编码
    cout << "=== GBK编码测试 ===" << endl;
    cout << "调试控制台编码测试：你好世界" << endl;
    cout << "中文测试：这是GBK编码" << endl;
    cout << "English test: Hello World" << endl;
    cout << "当前代码页: " << GetConsoleOutputCP() << endl;
    
    return 0;
}
